import { Outlet, NavLink } from 'react-router-dom';
import { Map, Camera, User } from 'lucide-react';
import { clsx } from 'clsx';

function Layout() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="bottom-nav flex justify-around items-center h-16 shadow-lg">
        <NavLink
          to="/"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center justify-center w-full h-full',
              isActive ? 'text-primary-600' : 'text-gray-500'
            )
          }
        >
          <Map className="w-6 h-6" />
          <span className="text-xs mt-1">マップ</span>
        </NavLink>

        <NavLink
          to="/camera"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center justify-center w-full h-full',
              isActive ? 'text-primary-600' : 'text-gray-500'
            )
          }
        >
          <Camera className="w-6 h-6" />
          <span className="text-xs mt-1">撮影</span>
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center justify-center w-full h-full',
              isActive ? 'text-primary-600' : 'text-gray-500'
            )
          }
        >
          <User className="w-6 h-6" />
          <span className="text-xs mt-1">プロフィール</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default Layout;
