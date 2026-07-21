import React, { useState } from "react";
import { Mail, Phone, MapPin, Send, CheckCircle2, MessageSquare } from "lucide-react";

interface ContactViewProps {
  setActiveTab: (tab: any) => void;
}

export default function ContactView({ setActiveTab }: ContactViewProps) {
  const [submitted, setSubmitted] = useState(false);
  const [fields, setFields] = useState({ name: "", email: "", phone: "", text: "" });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFields({ name: "", email: "", phone: "", text: "" });
  };

  return (
    <div className="bg-[#FAF9F6] py-12 font-sans" id="contact-us-view">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-[#316EC9] font-bold">
            Connect With Our Advisers
          </span>
          <h1 className="text-3xl font-serif italic text-[#142C54] mt-1">Get In Touch</h1>
          <p className="text-xs text-[#8C887D] mt-2 leading-relaxed">
            Discuss customized portfolios, claims rescues, or general quotes audits. Visit our head office in Nairobi or wire support lines 24H.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-5xl mx-auto">
          
          {/* LEFT: Contact Coordinates & Hours */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Core Address */}
            <div className="bg-white border border-[#D8E2F0] p-6 space-y-4">
              <h3 className="text-xs uppercase font-bold tracking-widest text-[#142C54] border-b border-slate-100 pb-2">
                Nairobi Offices Location
              </h3>
              
              <div className="flex items-start space-x-3 text-xs">
                <MapPin className="h-5 w-5 text-[#316EC9] shrink-0 mt-0.5" />
                <p className="leading-relaxed text-gray-700 font-mono">
                  <strong>Utmost Insurance Brokers Ltd</strong><br />
                  Top Plaza Building, <span className="bg-yellow-100 px-1 font-bold text-red-950">2nd Floor</span>,<br />
                  Kindaruma Road off Ngong Road,<br />
                  Nairobi, Kenya
                </p>
              </div>

              <div className="flex items-center space-x-3 text-xs pt-2">
                <Phone className="h-4.5 w-4.5 text-[#316EC9] shrink-0" />
                <p className="text-gray-700 font-mono">
                  <a href="tel:+254707798701" className="hover:underline">0707 798 701</a> / <a href="tel:+254732228908" className="hover:underline">0732 228 908</a>
                </p>
              </div>

              <div className="flex items-center space-x-3 text-xs">
                <Mail className="h-4.5 w-4.5 text-[#316EC9] shrink-0" />
                <a href="mailto:info@utmostkenya.com" className="text-gray-700 font-mono hover:underline">
                  info@utmostkenya.com
                </a>
              </div>
            </div>

            {/* Operating Times */}
            <div className="bg-[#142C54] text-[#FAF9F6] p-6 space-y-3">
              <h4 className="text-xs uppercase tracking-wider font-bold">Standard Office Hours</h4>
              <ul className="text-xs space-y-1.5 text-slate-300 font-mono">
                <li className="flex justify-between"><span>Mon — Fri:</span> <span>8:00 AM — 5:00 PM</span></li>
                <li className="flex justify-between"><span>Saturday:</span> <span>9:00 AM — 1:00 PM</span></li>
                <li className="flex justify-between"><span>Sunday:</span> <span>Closed</span></li>
                <li className="flex justify-between text-yellow-300 font-bold"><span>Claims Hotline:</span> <span>24 Hours Support</span></li>
              </ul>
            </div>

          </div>

          {/* RIGHT: Contact request Form */}
          <div className="lg:col-span-7">
            <div className="bg-white border border-[#D8E2F0] p-6 sm:p-8">
              <h3 className="text-xs uppercase font-bold tracking-widest text-[#142C54] mb-4">
                Send Direct Message
              </h3>

              {submitted ? (
                <div className="p-6 text-center bg-emerald-50 text-emerald-950 border border-emerald-200 space-y-3 my-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                  <p className="text-xs font-bold uppercase tracking-wider">Message Dispatched!</p>
                  <p className="text-[11px] text-gray-650 leading-relaxed">
                    Thank you. Your message has been logged inside our placement tracking CRM. An executive officer will callback inside 2 hours.
                  </p>
                  <button 
                    onClick={() => setSubmitted(false)}
                    className="text-xs text-[#142C54] hover:underline font-bold"
                  >
                    Send another query
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSend} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Company / Your Name *</label>
                      <input
                        type="text"
                        required
                        value={fields.name}
                        onChange={(e) => setFields({ ...fields, name: e.target.value })}
                        placeholder="e.g. Raymond Mwangi"
                        className="w-full bg-slate-50 border border-[#D8E2F0] p-2 text-xs text-[#142C54] focus:outline-none focus:border-[#316EC9] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Phone Number *</label>
                      <input
                        type="tel"
                        required
                        value={fields.phone}
                        onChange={(e) => setFields({ ...fields, phone: e.target.value })}
                        placeholder="e.g. 0707 798 701"
                        className="w-full bg-slate-50 border border-[#D8E2F0] p-2 text-xs text-[#142C54] focus:outline-none focus:border-[#316EC9] focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={fields.email}
                      onChange={(e) => setFields({ ...fields, email: e.target.value })}
                      placeholder="e.g. info@domain.com"
                      className="w-full bg-slate-50 border border-[#D8E2F0] p-2 text-xs text-[#142C54] focus:outline-none focus:border-[#316EC9] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Detailed Inquiry *</label>
                    <textarea
                      required
                      rows={4}
                      value={fields.text}
                      onChange={(e) => setFields({ ...fields, text: e.target.value })}
                      placeholder="Incorporate desired sum insured, asset logs, or general complaints advisory..."
                      className="w-full bg-slate-50 border border-[#D8E2F0] p-2.5 text-xs text-[#142C54] focus:outline-none focus:border-[#316EC9] focus:bg-white"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white py-3 text-xs uppercase tracking-widest font-bold font-mono transition-colors flex items-center justify-center gap-1.5 cursor-pointer rounded-none"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Message Coordinates</span>
                  </button>
                </form>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
