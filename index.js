require("dotenv").config();
const config = require("./config.json");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
mongoose.connect(config.connectionString);
const app = express();
const jwt = require("jsonwebtoken");
const { authenticateToken } = require("./utilities");
const User = require("./models/user.model");
const nodemailer = require("nodemailer");
const Note = require("./models/note.model");
const DeviceDetector = require("device-detector-js");
app.use(express.json());
const deviceDetector = new DeviceDetector();
const { Resend } = require("resend");
const Mailgun = require("mailgun.js");
const formData = require("form-data");
//sendgrid
const sgMail = require("@sendgrid/mail");



app.use(cors({ origin: "*" }));
const port = 8000;
app.listen(port, () => {
  console.log(`Server started on server ${port}`);
});
app.get("/", (req, res) => {
  res.json({ data: "Hello MemoBloom" });
});

// creating an resend instance(not using it since it requires the active domain)

const resend = new Resend(process.env.RESEND_API);


// Initialize Mailgun(not using now: some form of API error)

/*
const mailgun = new Mailgun( formData );
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY, 
});
*/

const DEMO_MODE = true; // ⚠️ Set to true for demo/interview purposes. Set to false for production.

// initialiing the sendGrid(working successfully)
if (DEMO_MODE) {
  console.log("---------------------------------------------------------");
  console.log("🚀 DEMO_MODE IS ACTIVE: SendGrid emails are being mocked.");
  console.log("---------------------------------------------------------");

  // Mock sgMail.send to prevent real API calls and log to console instead
  sgMail.send = async (msg) => {
    const recipient = Array.isArray(msg.to) ? msg.to.join(", ") : msg.to;
    console.log("\n--- [MOCK EMAIL] ---");
    console.log("FROM: dadapir19ce30@gmail.com");
    console.log("TO:", recipient);
    console.log("SUBJECT:", msg.subject);
    console.log("BODY (preview):", msg.html.replace(/<[^>]*>/g, '').substring(0, 150).trim() + "...");
    console.log("--------------------\n");
    return [{ statusCode: 202 }];
  };
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}


app.post("/create-account", async (req, res) => {
  try {

    console.log("Creating an account");

    const { fullname, email, password } = req.body;

    if (!fullname || !email || !password) return res.status(400).json({ error: true, message: "All fields are required" });


    const existingUser = await User.findOne({ email });
    if (existingUser) return res.json({ error: true, message: "Email already exists" });


    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = new User({ fullname, email, password, otp, otpExpiry });
    const userData = await user.save();

    console.log("6-digit OTP:", otp);
    console.log("OTP expiry:", otpExpiry);

    // Send OTP via Sendgrid

    const response = await sgMail.send({
      from: "dadapir19ce30@gmail.com",
      to: [email],
      subject: "[MemoBloom] Your OTP for Signup",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px; color: #333;">
          <div style="max-width: 500px; margin: auto; background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
            <h2 style="text-align: center; color: #2563eb; margin-bottom: 10px;">
              Welcome to <span style="color: #10b981;">MemoBloom</span> 🌸
            </h2>
            <p>Hi <strong>${fullname}</strong>,</p>
            <p>We received a request to sign up for a MemoBloom account using your email.</p>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 15px; margin: 20px 0; text-align: center; border-radius: 6px;">
              <p>Your OTP code is:</p>
              <h1 style="margin: 5px 0; font-size: 32px; letter-spacing: 3px; color: #1d4ed8;">${otp}</h1>
              <p>This OTP will expire in <strong>10 minutes</strong>.</p>
            </div>
            <p>If you did not request this, you can safely ignore this email.</p>
            <hr/>
            <p style="text-align: center; font-size: 13px; color: #9ca3af;">
              © ${new Date().getFullYear()} MemoBloom. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    console.log("Sendgrid response:", response);

    const accessToken = jwt.sign({ user }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "36000m",
    });

    res.status(201).json({
      error: false,
      message: "Created successfully",
      accessToken,
      user: userData,
    });

  } catch (error) {
    console.error("Error creating account:", error);
    res.status(500).json({ error: true, message: "Internal server error" });
  }
});

//login

app.post("/login", async (req, res) => {
  try {
    console.log("Logging...");
    const userLocation = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const device = deviceDetector.parse(userAgent);

    console.log("Device details:", device);

    const { email, password } = req.body;

    if (!email) return res.json({ error: true, message: "Email is required" });
    if (!password) return res.json({ error: true, message: "Password is required" });

    const isEmailExist = await User.findOne({ email });

    if (!isEmailExist)
      return res.json({
        error: true,
        message: "Email does not exist/User not found",
      });

    const isUser = await User.findOne({ email, password });
    console.log("getting isuser", isUser);
    if (!isUser) return res.json({ error: true, message: "Invalid email or password" });

    // Generate access token
    const accessToken = jwt.sign(
      { user: isUser },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "1h" }
    );

    // Send login notification email via sendGrid
    const emailResponse = await sgMail.send({
      from: "dadapir19ce30@gmail.com",
      to: email,
      subject: "[MemoBloom] New Login on MemoBloom",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #ffffff; padding: 20px; color: #333;">
          <div style="max-width: 500px; margin: auto; background: #ffffff; border-radius: 4px; padding: 20px; border: 1px solid #ddd;">
            
            <h2 style="text-align: center; color: #333; margin-bottom: 15px;">
              New Login to MemoBloom
            </h2>

            <p style="font-size: 15px; line-height: 1.5;">
              Hi <strong>${isUser.fullname}</strong>,
            </p>
            
            <p style="font-size: 15px; line-height: 1.5;">
              We noticed a new login to your <strong>MemoBloom</strong> account.
            </p>

            <p style="font-size: 14px; line-height: 1.5; background: #f9f9f9; padding: 10px; border: 1px solid #eee; border-radius: 4px;">
              📍 Location: <strong>${userLocation || "Unknown"}</strong><br/>
              💻 Device: <strong>${device.client?.name || "Not detected"}</strong><br/>
              🖥️ OS: <strong>${device.os?.name || "Not detected"}</strong><br/>
              📱 Device Type: <strong>${device.device?.type || "Not detected"}</strong><br/>
              ⏰ Time: <strong>${new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })}</strong>
            </p>

            <p style="font-size: 14px; line-height: 1.5; margin-top: 20px; color: #555;">
              If this was you, no further action is needed.<br/>
              If this wasn’t you, please reset your password immediately.
            </p>

            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />

            <p style="text-align: center; font-size: 12px; color: #999;">
              © ${new Date().getFullYear()} MemoBloom. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    console.log("Resend email response:", emailResponse);

    // Send success response
    return res.json({
      error: false,
      message: "Login successful and notification email sent",
      accessToken,
      user: isUser,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ error: true, message: "Failed to login or send email" });
  }
});


//create an account



// verify otp
app.post("/verify-otp", async (req, res) => {

  console.log("verifying the otp");
  const { email, otp } = req.body;

  if (!email) return res.json({ error: true, message: "Email is required" });

  if (!otp) return res.json({ error: true, message: "otp is required" });

  const isEmailExist = await User.findOne({ email: email });

  console.log("Email exist bro");

  //if email doesnt exist

  if (!isEmailExist) {
    console.log("Email does not exist");
    return res.json({
      error: true,
      message: "Email does not exist/User does not found",
    });
  }

  let verifiedOtp = await User.findOne({ email: email, otp: otp });

  // 🔹 DEMO_MODE Bypass: Allow "000000" or auto-approve if user exists
  if (!verifiedOtp && DEMO_MODE) {
    if (otp === "000000") {
      console.log("OTP Verification bypassed using Demo Code (000000)");
      verifiedOtp = await User.findOne({ email: email });
    }
  }

  if (!verifiedOtp) {
    console.log("Otp doesnt not match");
    return res.json({ error: false, message: "Otp doesnot match" });
  }

  // Check expiry unless in demo mode with master code
  if (verifiedOtp.otpExpiry < new Date() && !(DEMO_MODE && otp === "000000")) {
    console.log("Otp has been expired bro");
    return res.json({ error: false, message: "OTP has expired" });
  } else {
    console.log("Otp gets verified ");
    return res.json({ error: false, message: "otp verified" });

  }
});


//resend otp
app.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    console.log("Resending OTP to email:", email);

    if (!email) {
      return res.status(400).json({ error: true, message: "Email is required" });
    }

    // 🔹 Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    console.log("Generated OTP:", otp);
    console.log("OTP expiry:", otpExpiry);

    // 🔹 Update user with OTP & expiry
    const user = await User.findOneAndUpdate(
      { email },
      { otp, otpExpiry },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: true, message: "User not found" });
    }

    // 🔹 Send OTP email via SendGrid
    const emailResponse = await sgMail.send({
      from: "dadapir19ce30@gmail.com",
      to: email,
      subject: "[MemoBloom] Your OTP for Signup",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px; color: #333;">
          <div style="max-width: 500px; margin: auto; background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
            
            <h2 style="text-align: center; color: #2563eb; margin-bottom: 10px;">
              Welcome to <span style="color: #10b981;">MemoBloom</span>
            </h2>

            <p style="font-size: 15px; line-height: 1.5;">
              Hi <strong>${user.fullname}</strong>,
            </p>
            
            <p style="font-size: 15px; line-height: 1.5;">
              We received a request to sign up for a MemoBloom account using your email.
            </p>

            <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 15px; margin: 20px 0; text-align: center; border-radius: 6px;">
              <p style="margin: 0; font-size: 16px;">Your OTP code is:</p>
              <h1 style="margin: 5px 0; font-size: 32px; letter-spacing: 3px; color: #1d4ed8;">${otp}</h1>
              <p style="margin: 0; font-size: 13px; color: #6b7280;">This OTP will expire in <strong>10 minutes</strong>.</p>
            </div>

            <p style="font-size: 14px; color: #6b7280;">
              If you did not request this, you can safely ignore this email.
            </p>

            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />

            <p style="text-align: center; font-size: 13px; color: #9ca3af;">
              © ${new Date().getFullYear()} MemoBloom. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    console.log("OTP email sent via SendGrid:", emailResponse);

    return res.status(201).json({ error: false, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP via SendGrid:", error);
    return res.status(500).json({ error: true, message: "Failed to send OTP email" });
  }
});



//forgot password


app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    console.log("Resending the OTP to email for forgot password:", email);

    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    console.log("Generated 6-digit OTP:", otp);
    console.log("OTP expiry:", otpExpiry);

    // Update user with new OTP and expiry
    const user = await User.findOneAndUpdate(
      { email },
      { otp, otpExpiry },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: true, message: "User not found" });
    }

    // Sending OTP email via Resend
    const emailResponse = await sgMail.send({
      from: 'dadapir19ce30@gmail.com',
      to: email,
      subject: "[MemoBloom] Your OTP for Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px; color: #333;">
          <div style="max-width: 500px; margin: auto; background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
            
            <h2 style="text-align: center; color: #dc2626; margin-bottom: 10px;">
              Password Reset Request 🔒
            </h2>

            <p style="font-size: 15px; line-height: 1.5;">
              Hi <strong>${user.fullname}</strong>,
            </p>
            
            <p style="font-size: 15px; line-height: 1.5;">
              We received a request to reset your password for your <strong>MemoBloom</strong> account.
            </p>

            <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; margin: 20px 0; text-align: center; border-radius: 6px;">
              <p style="margin: 0; font-size: 16px;">Your OTP code is:</p>
              <h1 style="margin: 5px 0; font-size: 32px; letter-spacing: 3px; color: #b91c1c;">${otp}</h1>
              <p style="margin: 0; font-size: 13px; color: #6b7280;">This OTP will expire in <strong>10 minutes</strong>.</p>
            </div>

            <p style="font-size: 14px; color: #6b7280;">
              If you did not request this password reset, you can safely ignore this email. Your account will remain secure.
            </p>

            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />

            <p style="text-align: center; font-size: 13px; color: #9ca3af;">
              © ${new Date().getFullYear()} MemoBloom. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    console.log("SendGrid email response:", emailResponse);

    return res.status(201).json({
      error: false,
      message: "OTP email sent successfully for forgot password",
    });
  } catch (error) {
    console.error("Error sending OTP via sendGrid:", error);
    return res
      .status(500)
      .json({ error: true, message: "Failed to send OTP email" });
  }
});




//contact-section
app.post("/contact", async (req, res) => {
  try {
    console.log("Inside the contact section");
    const { email, message, name } = req.body;

    if (!email || !message || !name) {
      return res.status(400).json({
        error: true,
        message: "All fields (name, email, message) are required",
      });
    }

    // 🔹 Send the contact email using SendGrid
    const emailResponse = await sgMail.send({
      from: "dadapir19ce30@gmail.com", // Must be verified in SendGrid
      to: process.env.EMAIL_USERNAME, // admin email who receives the message
      subject: `[MemoBloom] New Contact Form Submission`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px; color: #333;">
          <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; padding: 20px; border: 1px solid #e5e7eb;">
            
            <h2 style="color: #4f46e5; margin-bottom: 10px;">
              📩 New Contact Message
            </h2>

            <p style="font-size: 15px;"><strong>Name:</strong> ${name}</p>
            <p style="font-size: 15px;"><strong>Email:</strong> ${email}</p>

            <div style="margin: 20px 0; padding: 15px; background: #f3f4f6; border-left: 4px solid #4f46e5; border-radius: 6px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6;">
                ${message}
              </p>
            </div>

            <p style="font-size: 12px; color: #6b7280; text-align:center; margin-top:20px;">
              © ${new Date().getFullYear()} MemoBloom. Contact Form Notification
            </p>
          </div>
        </div>
      `,
    });

    console.log("Contact email sent via SendGrid:", emailResponse);

    return res
      .status(201)
      .json({ error: false, message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending contact email via SendGrid:", error);
    return res
      .status(500)
      .json({ error: true, message: "Failed to send message" });
  }
});


//update-passowrd
app.post("/update-password", async (req, res) => {
  try {
    console.log("Updating password...");

    const { email, password } = req.body;

    if (!email) return res.json({ error: true, message: "Email is required" });
    if (!password)
      return res.json({ error: true, message: "Password is required" });

    // 🔹 Find and update user
    const user = await User.findOneAndUpdate(
      { email },
      { password },
      { new: true }
    );

    if (!user)
      return res.json({
        error: true,
        message: "User not found for this email",
      });

    // 🔹 Send confirmation email via SendGrid
    const emailResponse = await sgMail.send({
      from: "dadapir19ce30@gmail.com", // Must be verified in SendGrid
      to: email,
      subject: "[MemoBloom] Password Updated Successfully ✅",
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px; color: #333;">
          <div style="max-width: 500px; margin: auto; background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
            
            <h2 style="text-align: center; color: #16a34a; margin-bottom: 10px;">
              Password Updated Successfully ✅
            </h2>

            <p style="font-size: 15px; line-height: 1.5;">
              Hi <strong>${user.fullname}</strong>,
            </p>
            
            <p style="font-size: 15px; line-height: 1.5;">
              Your <strong>MemoBloom</strong> account password was updated successfully.
            </p>

            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; margin: 20px 0; border-radius: 6px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #166534;">
                If you made this change, you can safely ignore this email.
              </p>
              <p style="margin: 5px 0 0 0; font-size: 14px; color: #b91c1c;">
                If you did not change your password, please reset it immediately.
              </p>
            </div>

            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />

            <p style="text-align: center; font-size: 13px; color: #9ca3af;">
              © ${new Date().getFullYear()} MemoBloom. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    console.log("Password update email response:", emailResponse);

    // ✅ Send success response
    return res.json({
      error: false,
      message: "Password updated successfully and confirmation email sent",
      user,
    });
  } catch (error) {
    console.error("Update password error:", error);
    return res
      .status(500)
      .json({ error: true, message: "Failed to update password or send email" });
  }
});


// Get the user
app.get("/get-user", authenticateToken, async (req, res) => {
  const { user } = req.user;
  const userId = user._id;
  const isUser = await User.findOne({ _id: userId });
  if (!isUser) {
    return res.json({ error: true, message: "User Not Found" });
  }
  return res.json({
    error: false,
    user: { fullname: isUser.fullname, email: isUser.email },
    message: "User details",
  });
});

//update the name and the email
app.put("/update-profile", authenticateToken, async (req, res) => {
  const { fullname, email } = req.body || {};
  const { user } = req.user;
  const userId = user._id;
  if (!fullname) {
    return res.json({ error: true, message: "Enter the fullname" });
  }
  if (!email) {
    return res.json({ error: true, message: "Enter the email" });
  }
  try {
    const isUser = await User.findOne({ _id: userId });
    if (!isUser) {
      return res.json({ error: true, message: "Unauthorized" });
    }

    isUser.fullname = fullname;
    isUser.email = email;

    await isUser.save();

    return res.json({
      error: true,
      isUser,
      message: "Updated details successfully",
    });
  } catch (error) {
    return res.json({ error: true, message: "Internal server error" });
  }
});

// Add new note
app.post("/add-note", authenticateToken, async (req, res) => {
  const { title, content, tags } = req.body;
  const { user } = req.user;

  console.log("user data for adding the note", user);

  if (!title) return res.status(400).json({ error: true, message: "Title is required" });


  if (!content) return res.status(400).json({ error: true, message: "Content is required" });


  try {
    const note = new Note({
      title,
      content,
      tags: tags || [],
      userId: user._id,
    });

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note added successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});


//Edit Notes
app.put("/edit-note/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { title, content, tags, isPinned } = req.body;
  const { user } = req.user;

  if (!title && !content && !tags) {
    return res
      .status(400)
      .json({ error: true, message: "No changes provided" });
  }

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = tags;
    if (isPinned) note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

// get all notes
app.get("/get-note", authenticateToken, async (req, res) => {
  const { user } = req.user;
  const userID = user._id;
  //use find to get all the
  try {
    const note = await Note.find({ userId: user._id });
    return res.json({
      error: false,
      note,
      message: "All the notes retrived succesfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

// get an single note
app.get("/get-single-note/:noteID", authenticateToken, async (req, res) => {
  console.log("getting the single note id");
  const { user } = req.user;
  const userId = user._id;
  const noteId = req.params.noteID;

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });
    console.log("getting singlenote", note);
    return res.json({
      error: false,
      note,
      message: "All the notes retrived succesfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
});

//delete the note
app.delete("/delete-note/:noteID", authenticateToken, async (req, res) => {
  const { user } = req.user;
  const userId = user._id;
  const noteId = req.params.noteID;

  try {
    const note = await Note.findOne({ _id: noteId, userId: userId });
    if (!note) {
      return res.json({ error: true, message: "Note not found" });
    }
    await Note.deleteOne({ _id: noteId, userId: userId });

    return res.json({ error: false, message: "deleted successfully" });
  } catch (error) {
    return res.json({ error: true, message: "Internal server error" });
  }
});

//update the pin
app.put("/update-note-pin/:noteId", authenticateToken, async (req, res) => {
  const noteId = req.params.noteId;
  const { user } = req.user;
  const { updatedPin } = req.body;
  console.log("pinning the note");
  console.log("updatedPin", updatedPin);

  const userId = user._id;

  try {
    const note = await Note.findOne({ _id: noteId, userId: userId });
    if (!note) {
      console.log("Note note found")
      return res.json({ error: true, message: "Note not found" });
    }
    note.isPinned = updatedPin;
    await note.save();
    console.log("After pinning the note ");
    console.log(note);
    return res.json({
      error: false,
      note,
      message: "Updated The Pin Succesfully",
    });

  } catch (error) {
    return res.json({ error: true, message: "Inernal Server error" });
  }
});

module.exports = app;
