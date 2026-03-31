"use client";

import { motion } from "framer-motion";

export function Filmstrip() {
  return (
    <section className="border-y border-slate-900 bg-[#02060c] py-3">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-6 gap-2 overflow-hidden px-3 md:grid-cols-12">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: i * 0.02 }}
            className="h-16 rounded-lg border border-slate-900 bg-gradient-to-br from-slate-700/30 via-slate-800/20 to-slate-950/80 md:h-20"
          />
        ))}
      </div>
    </section>
  );
}
