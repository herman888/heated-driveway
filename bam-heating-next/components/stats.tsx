"use client";

import { motion } from "framer-motion";

const stats = [
  { value: "4", label: "Camera Models" },
  { value: "360°", label: "Panoramic Arc" },
  { value: "8+", label: "Workflow Tools" },
  { value: "5", label: "System Features" },
];

export function Stats() {
  return (
    <section className="border-y border-slate-900 bg-[#02060c]">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-4 px-4 py-10 sm:px-6 md:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.22, delay: i * 0.04 }}
            className="text-center"
          >
            <p className="text-2xl font-light text-slate-300 md:text-3xl">{stat.value}</p>
            <p className="mt-2 text-xs tracking-[0.18em] text-slate-600 uppercase">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
