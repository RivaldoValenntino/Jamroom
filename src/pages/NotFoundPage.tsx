import { Link } from 'react-router-dom';
import { Radio, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center text-center">
      <div className="h-16 w-16 rounded-2xl bg-destructive/20 text-destructive flex items-center justify-center mb-6">
        <Radio className="h-8 w-8" />
      </div>
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-3">
        404 — Lounge Not Found
      </h1>
      <p className="text-muted-foreground text-sm max-w-md mb-8">
        The virtual listening room you are looking for does not exist, has ended, or was archived.
      </p>
      <Link to="/explore">
        <Button variant="gradient" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Live Lounges
        </Button>
      </Link>
    </div>
  );
}
