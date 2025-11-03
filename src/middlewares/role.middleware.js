/**
 * Role-based access control middleware
 * Restricts access based on user roles
 */
export const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(200).json({
          success: false,
          message: 'Authentication required',
          data: null
        });
      }

      // Check if user role is allowed
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(200).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          data: null
        });
      }

      next();

    } catch (error) {
      console.error('Role middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization failed',
        data: null
      });
    }
  };
};

/**
 * Admin only access middleware
 */
export const adminOnlyMiddleware = roleMiddleware(['admin']);

/**
 * Customer only access middleware
 */
export const customerOnlyMiddleware = roleMiddleware(['customer']);

/**
 * Consultant only access middleware
 */
export const consultantOnlyMiddleware = roleMiddleware(['consultant']);

/**
 * Customer or consultant access middleware
 */
export const userOnlyMiddleware = roleMiddleware(['customer', 'consultant']);