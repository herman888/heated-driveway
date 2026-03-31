import { Features } from "@/components/features";
import { Filmstrip } from "@/components/filmstrip";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { Stats } from "@/components/stats";
import { Workflow } from "@/components/workflow";
import { FinalCta } from "@/components/final-cta";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#02060c] text-slate-100">
      <Navbar />
      <main>
        <Hero />
        <Filmstrip />
        <Features />
        <Workflow />
        <Stats />
        <FinalCta />
      </main>
    </div>
  );
}
