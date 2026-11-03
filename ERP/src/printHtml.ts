/**
 * Print an HTML document without leaving the page: it is loaded into a hidden frame and the browser's print
 * dialog is opened for that frame alone. srcdoc (rather than a blob or a new window) keeps it inside the page's
 * own security policy, and the document carries no script of its own.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "Receipt to print";
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        // print() blocks while the dialog is open; once it returns the frame is no longer needed
        setTimeout(() => frame.remove(), 1000);
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
