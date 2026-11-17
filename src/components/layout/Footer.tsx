import { Radio, Github, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-surface/30 py-8 text-xs text-muted-foreground">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground">JAMROOM</span>
          <span>— Collaborative Music Synchronization</span>
        </div>

        <div className="flex items-center gap-6">
          <span className="inline-flex items-center gap-1">
            Built with <Heart className="h-3.5 w-3.5 text-accent fill-accent" /> for music lovers
          </span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
