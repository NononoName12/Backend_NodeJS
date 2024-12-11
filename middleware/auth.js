const authMiddleware = (req, res, next) => {
  if (req.session && req.session.user) {
    // Nếu có session và có thông tin người dùng
    next(); // Cho phép tiếp tục đến route tiếp theo
  } else {
    // Nếu không có session hoặc không có thông tin người dùng
    res.status(401).json({ message: "Unauthorized: Please log in first." });
  }
};

module.exports = authMiddleware;
