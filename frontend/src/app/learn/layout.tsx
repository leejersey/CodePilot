import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-on-background">
      <Header />
      <div className="flex pt-[72px] h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 lg:ml-64 h-full relative">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#060e20]/90 backdrop-blur-lg flex justify-around items-center py-4 px-2 z-50 border-t border-white/5">
        <button className="flex flex-col items-center gap-1 text-cyan-400">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>book</span>
          <span className="text-[10px] font-label">Path</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-500">
          <span className="material-symbols-outlined">dashboard</span>
          <span className="text-[10px] font-label">Stats</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-500">
          <span className="material-symbols-outlined">forum</span>
          <span className="text-[10px] font-label">Chat</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-slate-500">
          <span className="material-symbols-outlined">person</span>
          <span className="text-[10px] font-label">Profile</span>
        </button>
      </nav>
    </div>
  );
}
