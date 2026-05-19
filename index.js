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
    await client.connect();

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
