import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/button';

/**
 * Usage Limit Modal - Shows when user has exceeded spending limits
 *
 * @param {boolean} isOpen - Whether the modal is open
 * @param {string} limitType - 'total_limit_exceeded' or 'daily_limit_exceeded'
 * @param {function} onClose - Callback when modal is closed
 */
function UsageLimitModal({ isOpen, limitType, onClose }) {
  if (!isOpen) return null;

  const isTotalLimit = limitType === 'total_limit_exceeded';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {isTotalLimit ? '使用上限已达到' : '今日使用上限已达到'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6 text-muted-foreground space-y-3">
          {isTotalLimit ? (
            <>
              <p>您的账户已达到使用总额度上限。</p>
              <p className="text-sm">
                请联系管理员提升您的额度限制，以继续使用 Claude 服务。
              </p>
            </>
          ) : (
            <>
              <p>您已达到今日使用额度上限。</p>
              <p className="text-sm">
                您可以等待明日额度重置后继续使用，或联系管理员提升您的每日额度限制。
              </p>
            </>
          )}
        </div>

        {/* Hint Box */}
        <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {isTotalLimit ? (
              <>
                <strong>提示：</strong>请联系您的管理员，申请提升使用额度。
              </>
            ) : (
              <>
                <strong>提示：</strong>每日额度将在次日 00:00 自动重置，您也可以联系管理员调整限额。
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <Button variant="default" onClick={onClose}>
            我知道了
          </Button>
        </div>
      </div>
    </div>
  );
}

export default UsageLimitModal;
