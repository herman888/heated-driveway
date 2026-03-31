"use client";

import { motion } from "framer-motion";

const steps = [
  { n: "01", title: "Explore", text: "Inspect live camera and sensor context for the current state." },
  { n: "02", title: "Generate", text: "Use AI to evaluate risk and select an operation strategy." },
  { n: "03", title: "Capture", text: "Apply relay action and save the final operational snapshot." },
];

export function Workflow() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <h2 className="mb-8 text-center text-xs font-semibold tracking-[0.3em] text-slate-500 uppercase">Workflow</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <motion.article
            key={s.n}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.28, delay: i * 0.06 }}
            className="rounded-2xl border border-slate-800 bg-[#050a12] p-6"
          >
            <p className="text-4xl font-light tracking-wide text-slate-700">{s.n}</p>
            <h3 className="mt-3 text-sm font-semibold tracking-[0.18em] text-slate-300 uppercase">{s.title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-500">{s.text}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
