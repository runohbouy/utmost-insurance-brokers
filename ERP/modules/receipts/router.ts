// Staff API for receipts, invoices and allocation. Mounted under /api by server.ts.
// Errors are RFC 7807 problem documents (see docs/api/errors.md).
import express from "express";
import { z } from "zod";
import { ALLOCATION_STRATEGIES } from "../../lib/finance/allocation-engine";
import { problemRoute } from "../../lib/http/problem";
import { tenantOf } from "../../lib/tenant";
import { idempotencyKey, parseBody, queryString, readPage, sendPage, type RouterDeps } from "../http";
import { printReceipt } from "./print";
import {
  RECEIPT_METHODS, allocateReceipt, approveReceipt, rejectReceipt, clientPosition, createInvoice, getInvoice, getReceipt, listInvoices, listReceipts,
  recordReceipt, reverseAllocation, transitionReceipt, voidInvoice, type Ctx,
} from "./service";

const minor = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const note = z.strictObject({ note: z.string().trim().max(500).optional() });

const newReceipt = z.strictObject({
  clientId: z.string().min(1),
  amountMinor: minor,
  method: z.enum(RECEIPT_METHODS),
  reference: z.string().trim().max(120).optional(),
  instrumentNo: z.string().trim().min(1).max(40).optional(),
  drawerBank: z.string().trim().max(120).optional(),
  receivedAt: z.string().datetime({ offset: true }).optional(),
});

const allocationRequest = z.strictObject({
  strategy: z.enum(ALLOCATION_STRATEGIES as unknown as [string, ...string[]]),
  manual: z.array(z.strictObject({ invoiceId: z.string().min(1), amountMinor: minor })).max(200).optional(),
});

const newInvoice = z.strictObject({
  kind: z.enum(["premium", "fee"]),
  policyId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  amountMinor: minor.optional(),
  description: z.string().trim().max(200).optional(),
  issueDate: day.optional(),
  dueDate: day.optional(),
});

export function createFinanceRouter({ requirePermission, actorId }: RouterDeps): express.Router {
  const router = express.Router();
  const ctx = (req: express.Request): Ctx => ({ tenantId: tenantOf(req), staffId: actorId(req) });

  // ----- receipts
  router.get("/receipts", requirePermission("finance.view"), problemRoute(async (req, res) => {
    const { rows, total } = await listReceipts(ctx(req), readPage(req), {
      status: queryString(req, "status"), clientId: queryString(req, "clientId"), method: queryString(req, "method"),
      holding: queryString(req, "holding"), from: queryString(req, "from"), to: queryString(req, "to"), approval: queryString(req, "approval"),
    });
    sendPage(res, rows, total);
  }));

  router.get("/receipts/:id", requirePermission("finance.view"), problemRoute(async (req, res) => {
    res.json(await getReceipt(ctx(req), req.params.id));
  }));

  router.post("/receipts", requirePermission("receipt.record"), problemRoute(async (req, res) => {
    const body = parseBody(newReceipt, req.body);
    const result = await recordReceipt(ctx(req), { ...body, idempotencyKey: idempotencyKey(req) });
    res.status(result.replayed ? 200 : 201).json(result);
  }));

  for (const [action, to] of [["deposit", "deposited"], ["clear", "cleared"], ["bounce", "bounced"], ["cancel", "cancelled"]] as const) {
    router.post(`/receipts/:id/${action}`, requirePermission("receipt.record"), problemRoute(async (req, res) => {
      const body = parseBody(note, req.body);
      res.json(await transitionReceipt(ctx(req), req.params.id, to, body.note));
    }));
  }

  // ----- maker-checker: someone other than the person who recorded the receipt decides
  router.post("/receipts/:id/approve", requirePermission("receipt.approve"), problemRoute(async (req, res) => {
    res.json(await approveReceipt(ctx(req), req.params.id, parseBody(note, req.body).note));
  }));

  router.post("/receipts/:id/reject", requirePermission("receipt.approve"), problemRoute(async (req, res) => {
    const body = parseBody(z.strictObject({ reason: z.string().trim().min(3).max(500) }), req.body);
    res.json(await rejectReceipt(ctx(req), req.params.id, body.reason));
  }));

  // ----- the printable receipt (POST because each print is recorded: the first is the original, later ones duplicates)
  router.post("/receipts/:id/print", requirePermission("finance.view"), problemRoute(async (req, res) => {
    const { html, copy } = await printReceipt(ctx(req), req.params.id);
    res.setHeader("X-Receipt-Copy", String(copy));
    res.setHeader("Access-Control-Expose-Headers", "X-Receipt-Copy");
    res.type("text/html").send(html);
  }));

  // ----- allocation
  router.post("/receipts/:id/allocations/preview", requirePermission("allocation.manage"), problemRoute(async (req, res) => {
    const body = parseBody(allocationRequest, req.body);
    res.json(await allocateReceipt(ctx(req), req.params.id, body as never, { dryRun: true }));
  }));

  router.post("/receipts/:id/allocations", requirePermission("allocation.manage"), problemRoute(async (req, res) => {
    const body = parseBody(allocationRequest, req.body);
    const result = await allocateReceipt(ctx(req), req.params.id, body as never, { idempotencyKey: idempotencyKey(req) });
    res.status(result.replayed ? 200 : 201).json(result);
  }));

  router.post("/allocations/:id/reverse", requirePermission("allocation.manage"), problemRoute(async (req, res) => {
    const body = parseBody(z.strictObject({ reason: z.string().trim().min(3).max(500) }), req.body);
    res.json(await reverseAllocation(ctx(req), req.params.id, body.reason));
  }));

  // ----- invoices
  router.get("/invoices", requirePermission("finance.view"), problemRoute(async (req, res) => {
    const { rows, total } = await listInvoices(ctx(req), readPage(req), {
      clientId: queryString(req, "clientId"), policyId: queryString(req, "policyId"), state: queryString(req, "state"),
    });
    sendPage(res, rows, total);
  }));

  router.get("/invoices/:id", requirePermission("finance.view"), problemRoute(async (req, res) => {
    res.json(await getInvoice(ctx(req), req.params.id));
  }));

  router.post("/invoices", requirePermission("invoice.manage"), problemRoute(async (req, res) => {
    res.status(201).json(await createInvoice(ctx(req), parseBody(newInvoice, req.body)));
  }));

  router.post("/invoices/:id/void", requirePermission("invoice.manage"), problemRoute(async (req, res) => {
    const body = parseBody(z.strictObject({ reason: z.string().trim().min(3).max(500) }), req.body);
    res.json(await voidInvoice(ctx(req), req.params.id, body.reason));
  }));

  // ----- a client's position
  router.get("/clients/:id/position", requirePermission("finance.view"), problemRoute(async (req, res) => {
    res.json(await clientPosition(ctx(req), req.params.id));
  }));

  return router;
}
