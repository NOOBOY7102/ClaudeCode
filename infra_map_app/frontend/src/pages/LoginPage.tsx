import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { authService, userService } from '../services/api';
import { useAuthStore } from '../store/authStore';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async () => {
      const token = await authService.login({ username, password });
      // Temporarily set token to fetch user
      useAuthStore.getState().setToken(token);
      const user = await userService.getMe();
      return { token, user };
    },
    onSuccess: ({ token, user }) => {
      login(user, token);
      navigate('/');
    },
    onError: (error: Error) => {
      setError('ユーザー名またはパスワードが正しくありません');
      useAuthStore.getState().setToken(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center">
          <MapPin className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">インフラマップ</h1>
      </div>

      {/* Login form */}
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-center mb-6">ログイン</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              ユーザー名
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              パスワード
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-primary-500 text-white py-2 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loginMutation.isPending ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          アカウントをお持ちでない方は{' '}
          <Link to="/register" className="text-primary-500 hover:underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
