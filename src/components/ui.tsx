import { ReactNode, JSX } from "react";

type ClassValue = string | undefined | null | false;

function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

interface CardProps {
  className?: string;
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

export function Card({ className, children, as: Component = "div" }: CardProps) {
  return <Component className={cn("card", className)}>{children}</Component>;
}

interface TagProps {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tag({ icon, children, className }: TagProps) {
  return (
    <span className={cn("tag", className)}>
      {icon}
      {children}
    </span>
  );
}

interface MutedProps {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  children: ReactNode;
}

export function Muted({ as: Component = "p", className, children }: MutedProps) {
  return <Component className={cn("muted", className)}>{children}</Component>;
}
