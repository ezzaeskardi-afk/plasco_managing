import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-input font-medium transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-basin text-basin-ink',
        secondary: 'border border-line bg-paper text-ink',
        outline: 'border border-line bg-transparent text-ink',
        ghost: 'bg-transparent text-ink',
        destructive: 'bg-out text-white',
        link: 'text-basin underline-offset-4',
      },
      size: {
        default: 'h-12 px-4 text-base',
        sm: 'h-10 rounded-input px-3 text-sm',
        lg: 'h-14 px-6 text-lg',
        icon: 'h-12 w-12',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'default', size: 'default', block: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, block, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}

