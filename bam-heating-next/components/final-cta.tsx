"use client";

import { motion } from "framer-motion";

export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-[#050b14] px-6 py-14 shadow-[0_22px_48px_rgba(2,6,23,0.45)]"
      >
        <div className="mx-auto mb-5 grid h-10 w-10 place-items-center rounded-md border border-emerald-300/70 bg-emerald-300/10 text-emerald-200">
          C
        </div>
        <h2 className="text-3xl font-light tracking-[0.08em] text-slate-100 md:text-4xl">Your Darkroom Awaits</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-500 md:text-base">
          No camera required. Build a full winter control session with AI-first commands and polished execution
          workflows.
        </p>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="mt-8 rounded-xl border border-emerald-300/40 bg-emerald-300/10 px-6 py-3 text-sm font-semibold tracking-[0.14em] text-emerald-100 uppercase transition duration-300 hover:bg-emerald-300/20"
        >
          Start Shooting
        </motion.button>
      </motion.div>
    </section>
  );
}
