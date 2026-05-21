const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000"].filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL || "http://localhost:3000"}/api/auth/jwks`),
);
const allowedOrigins = [
  "http://localhost:3000",
  "https://mediqueue-client-orcin.vercel.app",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(403).send({ message: "Forbidden access" });
  }
};

async function run() {
  try {
    // await client.connect();

    const db = client.db("tutor-booking-db");
    const tutorCollection = db.collection("tutors");
    const bookingCollection = db.collection("bookings");

    app.get("/featured-tutors", async (req, res) => {
      const result = await tutorCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

      res.send(result);
    });

    app.get("/tutors", async (req, res) => {
      const { search = "", startDate, endDate } = req.query;

      const query = {};

      if (search) {
        query.tutorName = { $regex: search, $options: "i" };
      }

      if (startDate || endDate) {
        query.sessionStartDate = {};

        if (startDate) {
          query.sessionStartDate.$gte = startDate;
        }

        if (endDate) {
          query.sessionStartDate.$lte = endDate;
        }
      }

      const result = await tutorCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/tutors/:tutorsId", verifyToken, async (req, res) => {
      const { tutorsId } = req.params;
      const query = { _id: new ObjectId(tutorsId) };
      const result = await tutorCollection.findOne(query);

      res.send(result);
    });

    app.post("/tutors", verifyToken, async (req, res) => {
      const tutorData = req.body;

      const tutor = {
        ...tutorData,
        hourlyFee: Number(tutorData.hourlyFee),
        totalSlot: Number(tutorData.totalSlot),
        createdAt: new Date().toISOString(),
      };

      const result = await tutorCollection.insertOne(tutor);

      res.send(result);
    });

    app.get("/my-tutors/:email", verifyToken, async (req, res) => {
      const { email } = req.params;

      const result = await tutorCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.patch("/tutors/:tutorsId", verifyToken, async (req, res) => {
      const { tutorsId } = req.params;
      const tutorData = req.body;

      delete tutorData._id;

      const updatedTutor = {
        ...tutorData,
        hourlyFee: Number(tutorData.hourlyFee),
        totalSlot: Number(tutorData.totalSlot),
      };

      const result = await tutorCollection.updateOne(
        { _id: new ObjectId(tutorsId) },
        { $set: updatedTutor },
      );

      res.send(result);
    });

    app.delete("/tutors/:tutorsId", verifyToken, async (req, res) => {
      const { tutorsId } = req.params;

      const result = await tutorCollection.deleteOne({
        _id: new ObjectId(tutorsId),
      });

      res.send(result);
    });

    app.post("/bookings", verifyToken, async (req, res) => {
      const bookingData = req.body;

      const tutor = await tutorCollection.findOne({
        _id: new ObjectId(bookingData.tutorId),
      });

      if (!tutor) {
        return res.status(404).send({ message: "Tutor not found" });
      }

      const alreadyBooked = await bookingCollection.findOne({
        tutorId: bookingData.tutorId,
        studentEmail: bookingData.studentEmail,
        status: { $ne: "cancelled" },
      });

      if (alreadyBooked) {
        return res.status(409).send({
          message: "You have already booked this tutor session.",
        });
      }

      if (Number(tutor.totalSlot) <= 0) {
        return res.status(409).send({
          message:
            "This session is fully booked. You can't join at the moment.",
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sessionDate = new Date(tutor.sessionStartDate);
      sessionDate.setHours(0, 0, 0, 0);

      if (today > sessionDate) {
        return res.status(409).send({
          message: "This tutor session has already started. Booking is closed.",
        });
      }

      const booking = {
        ...bookingData,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const result = await bookingCollection.insertOne(booking);

      await tutorCollection.updateOne(
        { _id: new ObjectId(bookingData.tutorId) },
        { $inc: { totalSlot: -1 } },
      );

      res.send(result);
    });
    app.get("/bookings/:email", verifyToken, async (req, res) => {
      const { email } = req.params;

      const result = await bookingCollection
        .find({ studentEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.patch("/bookings/:bookingId", verifyToken, async (req, res) => {
      const { bookingId } = req.params;

      const booking = await bookingCollection.findOne({
        _id: new ObjectId(bookingId),
      });

      if (!booking) {
        return res.status(404).send({ message: "Booking not found" });
      }

      if (booking.status === "cancelled") {
        return res.status(409).send({
          message: "This booking is already cancelled.",
        });
      }

      const result = await bookingCollection.updateOne(
        { _id: new ObjectId(bookingId) },
        { $set: { status: "cancelled" } },
      );

      await tutorCollection.updateOne(
        { _id: new ObjectId(booking.tutorId) },
        { $inc: { totalSlot: 1 } },
      );

      res.send(result);
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.log(error);
  }
}

run();

app.get("/", (req, res) => {
  res.send("Backend added");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
