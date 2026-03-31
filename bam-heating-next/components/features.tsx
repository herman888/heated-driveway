"use client";

import { motion } from "framer-motion";

const cards = [
  {
    title: "Camera Museum",
    text: "Explore system sessions with high-detail snapshots and historical state overlays.",
  },
  {
    title: "AI Panoramas",
    text: "Generate situational summaries from weather, relay state, and sensor readings.",
  },
  {
    title: "Gesture Control",
    text: "Move from command to action quickly with voice-first confirmation workflows.",
  },
  {
    title: "AI Enhancement",
    text: "Use intent parsing and smart recommendations for reliable winter operations.",
  },
  {
    title: "Contact Sheet",
    text: "Organize telemetry captures and snapshots into a clean operational timeline.",
  },
  {
    title: "Time Travel",
    text: "Review prior scenes and compare conditions to tune automation thresholds.",
  },
];

export function Features() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-slate-500 uppercase">System Characteristics</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, i) => (
          <motion.article
            key={card.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            whileHover={{ y: -5 }}
            className="rounded-2xl border border-slate-800 bg-[#060c14] p-6 shadow-[0_8px_24px_rgba(2,6,23,0.25)] transition duration-300 hover:shadow-[0_18px_36px_rgba(2,6,23,0.45)]"
          >
            <h3 className="text-sm font-semibold tracking-[0.18em] text-slate-300 uppercase">{card.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-500">{card.text}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
