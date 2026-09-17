import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/AuthGuard";
import { BookOpen, BarChart3, Code2, History } from "lucide-react";

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-background transition-colors duration-200">
        <Header />
        <div className="flex pt-[72px] h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 lg:ml-64 h-full relative">
            {children}
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 w-full bg-white/90 dark:bg-[#070b14]/90 backdrop-blur-lg flex justify-around items-center py-3 px-2 z-50 border-t border-slate-200/80 dark:border-white/5">
          <Link href="/learn" className="flex flex-col items-center gap-1 text-primary">
            <BookOpen className="w-5 h-5" />
            <span className="text-[10px] font-mono">课程</span>
          </Link>
          <Link href="/exercises" className="flex flex-col items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
            <Code2 className="w-5 h-5" />
            <span className="text-[10px] font-mono">演练</span>
          </Link>
          <Link href="/dashboard" className="flex flex-col items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-mono">统计</span>
          </Link>
          <Link href="/history" className="flex flex-col items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
            <History className="w-5 h-5" />
            <span className="text-[10px] font-mono">历史</span>
          </Link>
        </nav>
      </div>
    </AuthGuard>
  );
}
