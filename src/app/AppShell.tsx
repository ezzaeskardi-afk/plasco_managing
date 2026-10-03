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
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { fa } from '@/i18n/fa';
import { cn } from '@/lib/utils';
import { useSettings } from './settings-context';

const HOME_NAV = { to: '/', label: fa.nav.home, icon: Home } as const;
const PRODUCTS_NAV = { to: '/products', label: fa.nav.products, icon: Package } as const;
const MOVEMENTS_NAV = { to: '/movements', label: fa.nav.movements, icon: ArrowLeftRight } as const;
const MORE_NAV = { to: '/more', label: fa.nav.more, icon: Menu } as const;

const TITLES: ReadonlyArray<readonly [string, string]> = [
  ['/products', fa.products.title],
  ['/movements', fa.movements.title],
  ['/stocktake', fa.stocktake.title],
  ['/stock', fa.stock.receive],
  ['/more/status', fa.status.title],
  ['/more', fa.nav.more],
  ['/', fa.dashboard.title],
];

function titleFor(pathname: string): string {
  const hit = TITLES.find(([prefix]) => prefix !== '/' && pathname.startsWith(prefix));
  return hit?.[1] ?? fa.dashboard.title;
}

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
          'flex h-12 items-center gap-3 rounded-input px-3 text-ink',
          isActive && 'bg-frost text-basin',
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
          'flex h-16 flex-col items-center justify-center gap-1 text-[0.8rem]',
          isActive ? 'text-basin' : 'text-crate',
        )
      }
    >
      <Icon className="size-6" />
      <span>{label}</span>
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
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-input border border-line bg-paper p-3 text-ink"
            >
              <action.icon className="size-6 text-basin" />
              <span className="text-sm">{action.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AppShell() {
  const { settings } = useSettings();
  const location = useLocation();
  const [addOpen, setAddOpen] = useState(false);
  const title = titleFor(location.pathname);

  return (
    <div className="min-h-[100dvh] bg-frost">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col gap-2 border-e border-line bg-paper p-4 lg:flex">
        <div className="mb-2 flex items-center gap-2 px-3 py-2">
          <Box className="size-6 text-basin" />
          <span className="font-bold text-ink">{settings.shopName || fa.app.name}</span>
        </div>
        {[HOME_NAV, PRODUCTS_NAV, MOVEMENTS_NAV, MORE_NAV].map((item) => (
          <RailLink key={item.to} {...item} />
        ))}
        <div className="mt-auto">
          <RailLink to="/more/settings" label={fa.settings.title} icon={SettingsIcon} />
        </div>
      </aside>

      <header className="safe-t sticky top-0 z-20 border-b border-line bg-frost px-4 py-3 lg:ps-64">
        <div className="mx-auto w-full max-w-[1200px]">
          <h1 className="text-heading font-bold text-ink">{title}</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-4 lg:pb-10 lg:ps-64">
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
            className="-mt-6 flex size-14 items-center justify-center rounded-full bg-basin text-basin-ink"
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
        className="fixed bottom-8 end-8 z-30 hidden size-14 items-center justify-center rounded-full bg-basin text-basin-ink lg:flex"
      >
        <Plus className="size-6" />
      </button>

      <AddSheet open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
