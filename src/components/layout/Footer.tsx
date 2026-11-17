import { Radio, Github } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/50 py-4 text-xs text-muted-foreground">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground text-xs">JAMROOM</span>
          <span className="font-mono text-[11px]">— Synchronized Listening Engine</span>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span>v0.1.0 • PHASE 2</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <Github className="h-3 w-3" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
