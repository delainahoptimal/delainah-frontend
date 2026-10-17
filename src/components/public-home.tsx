import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CloudSun,
  Coins,
  Leaf,
  MapPinned,
  Tractor,
  Users,
} from "lucide-react";

const capabilities = [
  { icon: MapPinned, title: "Farm and crop records", text: "Keep farm profiles, crop seasons, and field activity connected in one place.", tone: "text-[#237957] bg-[#e5f3e9]" },
  { icon: Coins, title: "Agricultural finance", text: "Build a clearer picture of farm needs, opportunities, and progress.", tone: "text-[#a95d35] bg-[#fff0e5]" },
  { icon: Users, title: "Investor relationships", text: "Give investment partners a more transparent view of supported projects.", tone: "text-[#315f9e] bg-[#e9f0fb]" },
  { icon: BadgeCheck, title: "KYC and farmer identity", text: "Support trusted onboarding with identity checks and farmer records.", tone: "text-[#895f23] bg-[#fbf3db]" },
  { icon: Tractor, title: "Mechanization services", text: "Coordinate service requests and field teams around real farm activity.", tone: "text-[#a34f4a] bg-[#fbe9e6]" },
  { icon: CloudSun, title: "Weather and advisory", text: "Bring useful operational context closer to farmers and their teams.", tone: "text-[#36777d] bg-[#e4f1f1]" },
];

const steps = [
  { number: "01", title: "Create an account", text: "Register with your contact details and verify your account." },
  { number: "02", title: "Complete your profile", text: "Add the identity and organization details needed for your work." },
  { number: "03", title: "Connect farms and crops", text: "Build useful farm records and keep seasonal activity up to date." },
  { number: "04", title: "Work with your team", text: "Use the tools enabled for your role to manage field operations and growth." },
];

const audiences = [
  { icon: Leaf, title: "Farmers", text: "Manage your profile, farms, crops, service requests, and verification journey.", action: "Create a farmer account", href: "/register", tone: "bg-[#14794d] text-white", checks: ["Farm and crop records", "KYC progress", "Field service requests"] },
  { icon: ArrowUpRight, title: "Investors", text: "Follow projects and review the information shared with your account.", action: "Sign in to investor portal", href: "/login", tone: "bg-[#17251f] text-white", checks: ["Project visibility", "Portfolio activity", "Verified records"] },
  { icon: BadgeCheck, title: "Administrators and teams", text: "Coordinate people, permissions, field workflows, and platform oversight.", action: "Administrator sign in", href: "/login", tone: "bg-[#f0f3ef] text-[#17251f]", checks: ["Role-based access", "Operational workflows", "Audit visibility"] },
];

const questions = [
  { question: "Who can use De-Lainah?", answer: "Farmers, investors, field teams, and administrators use role-specific areas of the platform." },
  { question: "How do I get started as a farmer?", answer: "Create an account, verify your contact details, and complete the profile and identity steps available to you." },
  { question: "Can I manage more than one farm?", answer: "Farm accounts can keep multiple farm records and related crop activity together." },
  { question: "How is account access managed?", answer: "Access is based on your account, assigned roles, and permissions. Administrators can manage team access." },
  { question: "Can I use De-Lainah on a phone?", answer: "The web workspace adapts to mobile and desktop screens. Some field workflows also support encrypted offline queuing when accessed over HTTPS." },
];

export default function PublicHome() {
  return (
    <main className="overflow-hidden bg-white text-[#17251f]">
      <section className="relative isolate min-h-[600px] bg-[#102b21] text-white sm:min-h-[650px]">
        <Image
          src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2400&q=85"
          alt="Green farmland stretching across a gently rolling landscape"
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-center opacity-55"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(8,28,21,0.93)_0%,rgba(8,28,21,0.77)_48%,rgba(8,28,21,0.22)_100%)]" />
        <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="De-Lainah home" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-[#16a05e] text-white"><Leaf size={18} /></span>
            <span className="text-sm font-bold tracking-wide">De-Lainah</span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-xs font-medium text-white/75 md:flex">
            <a className="transition-colors hover:text-white" href="#platform">Platform</a>
            <a className="transition-colors hover:text-white" href="#how-it-works">How it works</a>
            <a className="transition-colors hover:text-white" href="#people">Who it is for</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden min-h-9 items-center px-3 text-xs font-semibold text-white hover:text-[#c7e46c] sm:inline-flex">Sign in</Link>
            <Link href="/register" className="inline-flex min-h-9 items-center gap-2 rounded-md bg-white px-3.5 text-xs font-bold text-[#17251f] transition-colors hover:bg-[#eaf3e9]">Get started <ArrowRight size={14} /></Link>
          </div>
        </header>
        <div className="mx-auto flex min-h-[510px] max-w-7xl items-center px-5 pb-16 pt-16 sm:min-h-[550px] sm:px-8 lg:px-12">
          <div className="max-w-2xl app-enter">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/10 px-3 py-1.5 text-[10px] font-semibold uppercase text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c7e46c]" /> Agriculture, connected
            </div>
            <h1 className="max-w-[640px] text-[42px] font-semibold leading-[1.06] sm:text-[56px]">A stronger future for Nigerian farms.</h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/75 sm:text-base sm:leading-7">One trusted place to connect farmer records, field operations, agricultural services, and the people investing in growth.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#149452] px-5 text-xs font-bold text-white transition-colors hover:bg-[#107b44]">Create a free account <ArrowRight size={15} /></Link>
              <Link href="/login" className="inline-flex min-h-11 items-center rounded-md border border-white/40 bg-white/5 px-5 text-xs font-bold text-white transition-colors hover:bg-white/15">Sign in</Link>
            </div>
            <p className="mt-5 text-[10px] text-white/60">Built for farmers, field teams, investors, and administrators.</p>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#102b21]/45 to-transparent" />
      </section>

      <section id="platform" className="scroll-mt-6 bg-[#f4f6f1] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase text-[#278456]">An active platform</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-[38px]">Everything important, in one place.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#66756c]">A connected workspace for the people and processes behind agricultural growth.</p>
          </div>
          <div className="mt-9 grid border-l border-t border-[#d5dfd6] sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text, tone }) => (
              <article key={title} className="min-h-40 border-b border-r border-[#d5dfd6] bg-white/65 p-5 sm:p-6">
                <span className={`grid h-9 w-9 place-items-center rounded-md ${tone}`}><Icon size={17} /></span>
                <h3 className="mt-4 text-sm font-bold">{title}</h3>
                <p className="mt-2 max-w-sm text-xs leading-5 text-[#69786f]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-6 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-[10px] font-bold uppercase text-[#278456]">A clear path forward</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-[38px]">Four steps to start growing.</h2>
            <p className="mt-3 text-sm leading-6 text-[#69786f]">Start with your account, then build the records and relationships your work needs.</p>
          </div>
          <ol className="mt-10 grid gap-px overflow-hidden border border-[#dce4dd] bg-[#dce4dd] sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.number} className={`min-h-48 p-6 ${["bg-[#e5f3e9]", "bg-[#fff0e5]", "bg-[#e9f0fb]", "bg-[#f0f1eb]"][index]}`}>
                <span className="mono text-[11px] font-semibold text-[#76847a]">STEP {step.number}</span>
                <h3 className="mt-8 text-base font-bold">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-[#637268]">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="people" className="scroll-mt-6 bg-[#f4f6f1] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-[10px] font-bold uppercase text-[#278456]">Who it is for</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-[38px]">A shared view of the value chain.</h2>
            <p className="mt-3 text-sm leading-6 text-[#69786f]">Purpose-built entry points for the people moving agriculture forward.</p>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {audiences.map(({ icon: Icon, title, text, action, href, tone, checks }) => (
              <article key={title} className={`flex min-h-[330px] flex-col rounded-md p-6 ${tone}`}>
                <Icon size={19} />
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className={`mt-2 text-xs leading-5 ${title === "Administrators and teams" ? "text-[#66756c]" : "text-white/75"}`}>{text}</p>
                <ul className={`mt-6 space-y-2.5 text-xs ${title === "Administrators and teams" ? "text-[#52645a]" : "text-white/85"}`}>
                  {checks.map((check) => <li key={check} className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${title === "Administrators and teams" ? "bg-[#278456]" : "bg-[#c7e46c]"}`} />{check}</li>)}
                </ul>
                <Link href={href} className={`mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold ${title === "Administrators and teams" ? "bg-white text-[#17251f]" : "bg-white/95 text-[#17251f]"}`}>
                  {action}<ArrowRight size={14} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase text-[#278456]">FAQ</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-[38px]">Common questions.</h2>
            <p className="mt-3 text-sm text-[#69786f]">A few things to know before getting started.</p>
          </div>
          <div className="mt-8 divide-y divide-[#dce4dd] border-y border-[#dce4dd]">
            {questions.map(({ question, answer }) => (
              <details key={question} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold marker:hidden">
                  {question}<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#dce4dd] text-[#64736a] transition-transform group-open:rotate-45"><span aria-hidden="true" className="text-lg font-normal leading-none">+</span></span>
                </summary>
                <p className="max-w-2xl pt-3 pr-10 text-xs leading-5 text-[#69786f]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-12 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 rounded-md bg-[#111b18] p-7 text-white sm:p-10 lg:flex-row lg:items-center lg:p-12">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase text-[#c7e46c]">Get started today</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-[40px]">Nigerian agriculture, powered by data and trust.</h2>
            <p className="mt-3 max-w-xl text-xs leading-5 text-white/65">Build stronger farm records, coordinate field work, and connect to the tools your role needs.</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Link href="/register" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#149452] px-4 text-xs font-bold text-white hover:bg-[#107b44]">Create a free account <ArrowRight size={14} /></Link>
            <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/25 px-4 text-xs font-bold text-white hover:bg-white/10">Sign in</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e1e7e1] px-5 py-7 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" aria-label="De-Lainah home" className="flex items-center gap-2 text-xs font-bold"><span className="grid h-7 w-7 place-items-center rounded bg-[#14794d] text-white"><Leaf size={14} /></span>De-Lainah</Link>
          <nav aria-label="Footer navigation" className="flex gap-5 text-[11px] text-[#69786f]"><a href="#platform" className="hover:text-[#17251f]">Platform</a><a href="#people" className="hover:text-[#17251f]">Who it is for</a><Link href="/login" className="hover:text-[#17251f]">Sign in</Link></nav>
          <p className="text-[10px] text-[#87948b]">De-Lainah Optimal Ltd.</p>
        </div>
      </footer>
    </main>
  );
}