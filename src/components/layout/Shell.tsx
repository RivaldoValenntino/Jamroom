import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { GuestOnboardingModal } from '@/features/auth/components/GuestOnboardingModal';
import { CreateRoomModal } from '@/components/room/CreateRoomModal';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface ShellProps {
  children: React.ReactNode;
  showFooter?: boolean;
}

export function Shell({ children, showFooter = true }: ShellProps) {
  // Initialize guest session and profile lifecycle
  useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-primary/30 selection:text-primary-foreground">
      <Navbar />
      <main className="flex-1">{children}</main>
      {showFooter && <Footer />}

      {/* Global Modals */}
      <GuestOnboardingModal />
      <CreateRoomModal />
    </div>
  );
}
