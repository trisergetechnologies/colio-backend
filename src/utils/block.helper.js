export const isBlockedEitherWay = (currentUser, targetUser) => {
  if (!currentUser || !targetUser) return false;

  const currentUserId = currentUser._id;

  return (
    currentUser.blockedUsers?.some(id => id.toString() === targetUser._id.toString()) ||
    targetUser.blockedUsers?.some(id => id.toString() === currentUserId.toString())
  );
};