import Link from "next/link";
import { ArrowRight, Clapperboard, Sparkles, Wand2, Layers, Film } from "lucide-react";

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl brand-gradient text-white"><Sparkles className="size-4" /></span>
          <span className="text-lg font-semibold tracking-tight">kronicle</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">kee</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <a href="#how" className="hover:text-fg">How it works</a>
          <a href="#pricing" className="hover:text-fg">Pricing</a>
          <Link href="/login" className="rounded-xl border border-line px-4 py-2 text-fg hover:bg-surface-2">Sign in</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-[#c4b5fd]">
            <Wand2 className="size-3.5" /> Script to screen, in one workspace
          </div>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
            Make the whole show.<br /><span className="brand-text">Not just a scene.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">
            Paste a script, split it into episodes, cast the characters, storyboard the shots, generate the video,
            and cut it on a timeline. One workspace, one credit balance, no render farm.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl brand-gradient px-6 text-sm font-medium text-white">
              Start a show <ArrowRight className="size-4" />
            </Link>
            <a href="#pricing" className="inline-flex h-12 items-center rounded-xl border border-line px-6 text-sm text-fg hover:bg-surface-2">
              See pricing
            </a>
          </div>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            { icon: Layers, title: "Script → episodes", body: "Analyse a script, split it, and make every episode shoot-ready." },
            { icon: Clapperboard, title: "Cast & places", body: "Write prompts for every character, location and prop, then generate looks." },
            { icon: Film, title: "Cut it yourself", body: "Storyboard frames become a timeline. Trim, split, add music, export." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-6">
              <f.icon className="mb-4 size-5 text-[#c4b5fd]" />
              <div className="text-base font-semibold">{f.title}</div>
              <p className="mt-2 text-sm leading-6 text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-line bg-[#0e1014]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">A workspace built around the episode</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              Script, script assets, plan, asset variants, storyboard and video are stages in one project — not six tools.
              Every credit you spend is visible in the usage ledger.
            </p>
          </div>
          <ol className="space-y-4">
            {["Paste a script or an idea", "Check the episodes and pick a look", "Write prompts, generate looks", "Build the plan and storyboard", "Generate video and cut it"].map((s, i) => (
              <li key={s} className="flex gap-4 rounded-xl border border-line bg-surface p-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-brand/40 bg-brand/10 text-xs text-[#c4b5fd]">{i + 1}</span>
                <span className="text-sm">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Buy credits</h2>
        <p className="mt-2 text-sm text-muted">The more you buy, the more extra credits you get.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { price: 100, credits: 100, tag: "Base rate" },
            { price: 200, credits: 220, tag: "+10% extra" },
            { price: 500, credits: 550, tag: "+10% extra" },
          ].map((p) => (
            <div key={p.price} className={`rounded-2xl border p-6 ${p.credits === 100 ? "border-brand/50 bg-surface" : "border-line bg-surface"}`}>
              <div className="text-2xl font-semibold">₹{p.price}.00</div>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted"><Sparkles className="size-4 text-[#c4b5fd]" /> {p.credits} credits</div>
              <div className="mt-1 text-xs text-muted">{p.tag}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Mock checkout in this replica. No real payments.</p>
      </section>

      <footer className="border-t border-line px-6 py-8 text-center text-xs text-muted">
        Clean-room replica for product learning and authorised research. Not affiliated with Kronicle.
      </footer>
    </div>
  );
}
