"use client";

import { motion } from "framer-motion";

const links = ["Product", "Pricing", "Docs"];

export function Navbar() {
  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-emerald-200/10 bg-[#030912]/75 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-md border border-emerald-300/60 bg-emerald-300/10 text-sm font-bold text-emerald-200">
            C
          </span>
          <div className="text-sm font-semibold tracking-[0.28em] text-slate-200">BAM CRAFT</div>
        </div>
        <nav className="hidden items-center gap-2 md:flex">
          {links.map((link) => (
            <a
              key={link}
              href="#"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition duration-200 hover:bg-emerald-300/10 hover:text-slate-100"
            >
              {link}
            </a>
          ))}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="ml-2 rounded-xl border border-emerald-300/40 bg-emerald-300/15 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-sm transition duration-200 hover:bg-emerald-300/25"
          >
            Start Session
          </motion.button>
        </nav>
      </div>
    </motion.header>
  );
}
