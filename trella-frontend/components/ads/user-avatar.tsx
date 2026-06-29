'use client';
import Avatar from '@atlaskit/avatar';

interface UserAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
}

export function UserAvatar({ name, src, size = 'small' }: UserAvatarProps) {
  return (
    <Avatar
      name={name ?? 'Unknown'}
      src={src ?? undefined}
      size={size}
    />
  );
}

interface AvatarData {
  key: string;
  name?: string | null;
  src?: string | null;
}

interface UserAvatarGroupProps {
  users: AvatarData[];
  maxCount?: number;
}

// ponytail: simple stacked avatars — no @atlaskit/avatar-group dep needed
export function UserAvatarGroup({ users, maxCount = 5 }: UserAvatarGroupProps) {
  const visible = users.slice(0, maxCount);
  const overflow = users.length - maxCount;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {visible.map((u, i) => (
        <div key={u.key} style={{ marginLeft: i > 0 ? -8 : 0 }}>
          <Avatar name={u.name ?? undefined} src={u.src ?? undefined} size="small" />
        </div>
      ))}
      {overflow > 0 && (
        <div style={{
          marginLeft: -8,
          width: 28, height: 28, borderRadius: '50%',
          backgroundColor: '#E8ECF0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: '#42526E',
        }}>
          +{overflow}
        </div>
      )}
    </div>
  );
}
