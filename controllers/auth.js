const mongoose = require("mongoose");
const User = require("../models/user"); // Đảm bảo đường dẫn chính xác đến mô hình User
const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

// // Thông tin OAuth2
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

// Tạo một OAuth2 client với các thông tin trên
const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Tạo 1 hàm gửi email tự động dùng nodemailer, OAuth2
async function sendMail(email) {
  try {
    // Lấy access token từ OAuth2 client
    const accessToken = await oAuth2Client.getAccessToken();

    // Tạo transporter với OAuth2
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: "nguyenphucbao25507@gmail.com",
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    // Cấu hình email
    const mailOptions = {
      from: "Test Nodemailer <nguyenphucbao25507@gmail.com>",
      to: `${email}`,
      subject: "Signup succeeded!",
      text: "This email is sent using OAuth2 and Nodemailer.",
      html: "<h1>You successfully signed up!</h1>",
    };

    // Gửi email
    const result = await transporter.sendMail(mailOptions);
    console.log("Email sent...", result);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Lấy thông tin lỗi nếu validation lỗi
exports.getSignup = (req, res, next) => {
  let message = req.flash("error");
  if (message.length > 0) {
    message = message[0];
  } else {
    message = null;
  }
  res.json({
    path: "/signup",
    pageTitle: "Signup",
    errorMessage: message,
    validationErrors: [],
  });
};

// Nhận thông tin đăng nhập từ client và xử lí
exports.postSignin = (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;
  const errors = validationResult(req);

  if (!email) {
    return res.status(400).json({
      path: "/login",
      pageTitle: "Login",
      errorMessage: "Email is required",
      validationErrors: [],
    });
  }

  if (!errors.isEmpty()) {
    return res.status(422).json({
      path: "/login",
      pageTitle: "Login",
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }

  User.findOne({ email: email })
    .then((user) => {
      if (!user) {
        return res.status(422).json({
          path: "/login",
          pageTitle: "Login",
          errorMessage: "Invalid email or password.",
          validationErrors: [],
        });
      }

      bcrypt
        .compare(password, user.password)
        .then((doMatch) => {
          if (doMatch) {
            req.session.isLoggedIn = true;
            req.session.user = user;
            // Gửi cookie tới client
            res.cookie("token", "example", {
              httpOnly: true,
              secure: true,
              sameSite: "None",
            });
            console.log("Session before save:", req.session); // Log session data
            req.session.save((err) => {
              if (err) {
                return res.status(500).json({
                  path: "/login",
                  pageTitle: "Login",
                  errorMessage: "Session save error.",
                  validationErrors: [],
                });
              }
              return res.status(200).json({
                message: "Login successful",
                user: user,
              });
            });
          } else {
            return res.status(422).json({
              path: "/login",
              pageTitle: "Login",
              errorMessage: "Invalid email or password.",
              validationErrors: [],
            });
          }
        })
        .catch((err) => {
          console.error(err);
          return res.status(500).json({
            path: "/login",
            pageTitle: "Login",
            errorMessage: "Server error during password comparison.",
            validationErrors: [],
          });
        });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({
        path: "/login",
        pageTitle: "Login",
        errorMessage: "Server error during user search.",
        validationErrors: [],
      });
    });
};

// Nhận thông tin đăng kí tài khoản từ client và xử lí
exports.postSignup = async (req, res, next) => {
  // Định nghĩa số vòng mã hóa
  const saltRounds = 10;
  // Xử lý lỗi validate đầu vào
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors.array());
    return res.status(422).json({
      path: "/signup",
      pageTitle: "Signup",
      errorMessage: errors.array()[0].msg,
      validationErrors: errors.array(),
    });
  }
  try {
    const { password, fullName, phone, email, isAdmin } = req.body;
    console.log(req.body);
    // Kiểm tra xem người dùng đã tồn tại chưa
    // Kiểm tra xem tên đăng nhập và email đã tồn tại chưa
    const existingUserByUsername = await User.findOne({ fullName });
    const existingUserByEmail = await User.findOne({ email });

    if (existingUserByUsername) {
      return res
        .status(400)
        .json({ errorMessage: "Username is already in use" });
    }

    if (existingUserByEmail) {
      return res.status(400).json({ errorMessage: "Email is already in use" });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Tạo người dùng mới với mật khẩu đã mã hóa
    const newUser = new User({
      password: hashedPassword,
      fullName,
      phone,
      email,
      isAdmin,
    });

    // Lưu người dùng vào cơ sở dữ liệu
    await newUser.save();
    sendMail(email);
    res.status(201).json({ message: "Đăng ký thành công", user: newUser });
  } catch (error) {
    console.error("Lỗi đăng ký:", error);

    res.status(500).json({
      message: "Đã xảy ra lỗi trong quá trình đăng ký",
      error: error.message,
    });
  }
};

// Nhận thông tin logout từ client và xử lí
exports.postLogout = async (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Failed to log out." });
    }
    res.clearCookie("connect.sid"); // Xóa cookie session nếu có
    res.status(200).json({ message: "Logged out successfully." });
  });
};
