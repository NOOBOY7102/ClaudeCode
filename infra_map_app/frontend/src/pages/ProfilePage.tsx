import { useQuery } from '@tanstack/react-query';
import { LogOut, Trophy, MapPin, CheckCircle, Clock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { userService } from '../services/api';

function ProfilePage() {
  const { user, logout } = useAuthStore();

  // Fetch user stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['userStats'],
    queryFn: () => userService.getStats(),
  });

  // Fetch ranking
  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['ranking'],
    queryFn: () => userService.getRanking(10),
  });

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="h-full overflow-auto bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-primary-500 text-white p-6 pt-safe">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">プロフィール</h1>
          <button onClick={handleLogout} className="p-2">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold">
              {user?.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold">{user?.username}</h2>
            <p className="text-white/80 text-sm">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-700 mb-3">あなたの貢献</h3>
        {statsLoading ? (
          <div className="flex justify-center py-8">
            <div className="spinner w-8 h-8" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-primary-500 mb-2">
                <Trophy className="w-5 h-5" />
                <span className="text-sm font-medium">ランキング</span>
              </div>
              <p className="text-2xl font-bold">{stats.rank}位</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-green-500 mb-2">
                <MapPin className="w-5 h-5" />
                <span className="text-sm font-medium">登録ポイント</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_points_reported}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-blue-500 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">検証済み</span>
              </div>
              <p className="text-2xl font-bold">{stats.verified_points}</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2 text-orange-500 mb-2">
                <Clock className="w-5 h-5" />
                <span className="text-sm font-medium">検証回数</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_verifications}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Ranking */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-700 mb-3">貢献ランキング</h3>
        {rankingLoading ? (
          <div className="flex justify-center py-8">
            <div className="spinner w-8 h-8" />
          </div>
        ) : ranking ? (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {ranking.map((item, index) => (
              <div
                key={item.user_id}
                className={`flex items-center justify-between p-4 ${
                  index !== ranking.length - 1 ? 'border-b border-gray-100' : ''
                } ${item.user_id === user?.id ? 'bg-primary-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      item.rank === 1
                        ? 'bg-yellow-100 text-yellow-600'
                        : item.rank === 2
                        ? 'bg-gray-100 text-gray-600'
                        : item.rank === 3
                        ? 'bg-orange-100 text-orange-600'
                        : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    {item.rank}
                  </span>
                  <span
                    className={`font-medium ${
                      item.user_id === user?.id ? 'text-primary-600' : ''
                    }`}
                  >
                    {item.username}
                  </span>
                </div>
                <span className="text-gray-500">
                  {item.contribution_points} pts
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Achievement badges (placeholder) */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-700 mb-3">バッジ</h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
          <div className="flex-shrink-0 w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">🎯</span>
          </div>
          <div className="flex-shrink-0 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">🌟</span>
          </div>
          <div className="flex-shrink-0 w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">🏆</span>
          </div>
          <div className="flex-shrink-0 w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center opacity-50">
            <span className="text-2xl">🔒</span>
          </div>
          <div className="flex-shrink-0 w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center opacity-50">
            <span className="text-2xl">🔒</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
