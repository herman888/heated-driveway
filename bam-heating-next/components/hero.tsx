"use client";

import { motion } from "framer-motion";

export function Hero() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-18 pb-18 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="mx-auto max-w-3xl text-center"
      >
        <p className="mb-5 text-xs font-semibold tracking-[0.3em] text-emerald-300 uppercase">Precision System</p>
        <h1 className="text-5xl font-light tracking-[0.18em] text-slate-100 sm:text-6xl lg:text-7xl">
          BAM
          <br />
          <span className="text-emerald-200">CRA﻿FT</span>
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
          Build cinematic, AI-assisted driveway operations with live telemetry, voice commands, and clean control
          workflows designed for winter-critical response.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-full border border-emerald-300/70 bg-emerald-300/15 px-6 py-3 text-sm font-semibold text-emerald-100 shadow-sm transition duration-200 hover:bg-emerald-300/25"
          >
            Start Shooting
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-full border border-slate-700 bg-[#090f19] px-6 py-3 text-sm font-semibold text-slate-300 transition duration-200 hover:bg-[#111a29]"
          >
            Watch Workflow
          </motion.button>
        </div>
      </motion.div>
    </section>
  );
}
