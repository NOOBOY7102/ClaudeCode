import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle, XCircle, MapPin, Clock, User } from 'lucide-react';
import { pointsService } from '../../services/api';
import { useMapStore } from '../../store/mapStore';
import { toast } from '../UI/Toast';
import type { InfrastructurePoint } from '../../types';

interface PointDetailSheetProps {
  point: InfrastructurePoint;
  onClose: () => void;
}

export function PointDetailSheet({ point, onClose }: PointDetailSheetProps) {
  const [verifyComment, setVerifyComment] = useState('');
  const queryClient = useQueryClient();
  const { setSelectedPoint } = useMapStore();

  const verifyMutation = useMutation({
    mutationFn: ({ isCorrect, comment }: { isCorrect: boolean; comment?: string }) =>
      pointsService.verifyPoint(point.id, isCorrect, comment),
    onSuccess: () => {
      toast.success('検証を記録しました');
      queryClient.invalidateQueries({ queryKey: ['points'] });
      setVerifyComment('');
    },
    onError: () => {
      toast.error('検証に失敗しました');
    },
  });

  const handleVerify = (isCorrect: boolean) => {
    verifyMutation.mutate({
      isCorrect,
      comment: verifyComment || undefined,
    });
  };

  const handleClose = () => {
    setSelectedPoint(null);
    onClose();
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      tactile_paving: '点字ブロック',
      crosswalk: '横断歩道',
      traffic_light: '信号機',
      slope: 'スロープ',
    };
    return labels[type] || type;
  };

  const getSubtypeLabel = (subtype: string | null) => {
    if (!subtype) return null;
    const labels: Record<string, string> = {
      warning: '警告ブロック（点状）',
      guiding: '誘導ブロック（線状）',
    };
    return labels[subtype] || subtype;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      pending: { text: '未検証', color: 'text-yellow-600 bg-yellow-100' },
      verified: { text: '検証済み', color: 'text-green-600 bg-green-100' },
      rejected: { text: '却下', color: 'text-red-600 bg-red-100' },
    };
    return labels[status] || { text: status, color: 'text-gray-600 bg-gray-100' };
  };

  const status = getStatusLabel(point.status);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-40 max-h-[70vh] overflow-auto pb-safe">
      {/* Handle bar */}
      <div className="flex justify-center py-2">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-4 pb-2">
        <div>
          <h3 className="text-lg font-bold">{getTypeLabel(point.type)}</h3>
          {point.subtype && (
            <p className="text-sm text-gray-600">{getSubtypeLabel(point.subtype)}</p>
          )}
        </div>
        <button onClick={handleClose} className="p-2">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image */}
      {point.image_url && (
        <div className="px-4 pb-4">
          <img
            src={point.image_url}
            alt="Infrastructure"
            className="w-full h-48 object-cover rounded-lg"
          />
        </div>
      )}

      {/* Details */}
      <div className="px-4 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
            {status.text}
          </span>
          <span className="text-sm text-gray-500">
            信頼度: {(point.confidence * 100).toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>
            {point.location.lat.toFixed(6)}, {point.location.lng.toFixed(6)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          <span>
            {new Date(point.created_at).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {point.reported_by && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="w-4 h-4" />
            <span>報告者: {point.reported_by.slice(0, 8)}...</span>
          </div>
        )}
      </div>

      {/* Verification section */}
      {point.status === 'pending' && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4">
          <h4 className="font-medium mb-3">このポイントを検証する</h4>
          <textarea
            value={verifyComment}
            onChange={(e) => setVerifyComment(e.target.value)}
            placeholder="コメント（任意）"
            className="w-full p-3 border border-gray-300 rounded-lg text-sm resize-none"
            rows={2}
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={() => handleVerify(true)}
              disabled={verifyMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              <CheckCircle className="w-5 h-5" />
              正しい
            </button>
            <button
              onClick={() => handleVerify(false)}
              disabled={verifyMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              <XCircle className="w-5 h-5" />
              誤り
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PointDetailSheet;
