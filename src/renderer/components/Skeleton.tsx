import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton rounded-lg ${className}`} />
);

export const GameListSkeleton: React.FC = () => (
  <div className="space-y-2 pr-2">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center gap-3 p-3">
        <Skeleton className="w-5 h-5 rounded-md" />
        <Skeleton className="flex-grow h-4" />
      </div>
    ))}
  </div>
);

export const SquadSkeleton: React.FC = () => (
  <div className="space-y-2 pr-2">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center justify-between p-2">
        <Skeleton className="w-28 h-4" />
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
    ))}
  </div>
);