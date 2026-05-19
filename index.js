const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let tutorCollection;
let bookingCollection;

async function run() {
  try {
    await client.connect();

    const db = client.db("tutor-booking-db");
    tutorCollection = db.collection("tutors");
    bookingCollection = db.collection("bookings");

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
