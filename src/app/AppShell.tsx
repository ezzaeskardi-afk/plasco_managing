import {
  ArrowLeftRight,
  Box,
  ClipboardList,
  Home,
  Menu,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  ShoppingBasket,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { fa } from '@/i18n/fa';
import { cn } from '@/lib/utils';

const HOME_NAV = { to: '/', label: fa.nav.home, icon: Home } as const;
const PRODUCTS_NAV = { to: '/products', label: fa.nav.products, icon: Package } as const;
const MOVEMENTS_NAV = { to: '/movements', label: fa.nav.movements, icon: ArrowLeftRight } as const;
const MORE_NAV = { to: '/more', label: fa.nav.more, icon: Menu } as const;

const ADD_ACTIONS = [
  { label: fa.products.new, icon: PackagePlus, to: '/products/new' },
  { label: fa.stock.receive, icon: ShoppingBasket, to: '/stock/receive' },
  { label: fa.stock.issue, icon: Truck, to: '/stock/issue' },
  { label: fa.stock.transfer, icon: ArrowLeftRight, to: '/stock/transfer' },
  { label: fa.stock.adjust, icon: Pencil, to: '/stock/adjust' },
  { label: fa.stocktake.start, icon: ClipboardList, to: '/stocktake/new' },
];

type Icon = typeof Home;

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-12 items-center gap-3 rounded-input px-3 text-crate hover:bg-frost hover:text-ink',
          isActive && 'bg-basin/10 font-semibold text-basin hover:bg-basin/10 hover:text-basin',
        )
      }
    >
      <Icon className="size-5" />
      <span>{label}</span>
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon }: { to: string; label: string; icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-16 flex-col items-center justify-center gap-0.5 text-[0.8rem]',
          isActive ? 'text-basin' : 'text-crate',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full',
              isActive && 'bg-basin/10',
            )}
          >
            <Icon className="size-5" />
          </span>
          <span className={cn(isActive && 'font-semibold')}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function AddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={fa.nav.add}>
        <div className="grid grid-cols-2 gap-3">
          {ADD_ACTIONS.map((action) => (
            <button
              key={action.to}
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate(action.to);
              }}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-card border border-line bg-paper p-3 text-ink hover:border-basin/40 hover:bg-frost/60"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-basin/10 text-basin">
                <action.icon className="size-5" />
              </span>
              <span className="text-[0.9rem] font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AppShell() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-frost">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col gap-1.5 border-e border-line bg-paper p-3 lg:flex">
        <div className="mb-3 flex items-center px-1 py-1">
          <span className="flex size-10 items-center justify-center rounded-input bg-basin/10 text-basin">
            <Box className="size-5" />
          </span>
        </div>
        {[HOME_NAV, PRODUCTS_NAV, MOVEMENTS_NAV, MORE_NAV].map((item) => (
          <RailLink key={item.to} {...item} />
        ))}
        <div className="mt-auto border-t border-line pt-3">
          <RailLink to="/more/settings" label={fa.settings.title} icon={SettingsIcon} />
        </div>
      </aside>

      {/* No page-title bar anywhere: the user asked for no name at the top of
          any page — the rail, the bottom nav and the content already say where
          you are (§11.23). */}
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-6 lg:pb-12 lg:pe-8 lg:ps-64 lg:pt-8">
        <Outlet />
      </main>

      <nav className="safe-b fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-paper lg:hidden">
        <BottomLink {...HOME_NAV} />
        <BottomLink {...PRODUCTS_NAV} />
        <div className="flex items-start justify-center">
          <button
            type="button"
            aria-label={fa.nav.add}
            onClick={() => setAddOpen(true)}
            className="-mt-6 flex size-14 items-center justify-center rounded-full bg-basin text-basin-ink ring-4 ring-frost active:brightness-95"
          >
            <Plus className="size-7" />
          </button>
        </div>
        <BottomLink {...MOVEMENTS_NAV} />
        <BottomLink {...MORE_NAV} />
      </nav>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        aria-label={fa.nav.add}
        className="fixed bottom-8 end-8 z-30 hidden size-14 items-center justify-center rounded-full bg-basin text-basin-ink ring-4 ring-frost hover:bg-basin/90 active:brightness-95 lg:flex"
      >
        <Plus className="size-6" />
      </button>

      <AddSheet open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
