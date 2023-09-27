var express = require("express");
var app = express();
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const axios = require("axios");
const ejs = require("ejs");
const parser = require("body-parser");
const port = 3000;

var serviceAccount = require("./key.json");
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
app.set("view engine", "ejs");
app.use(parser.urlencoded({ extended: true }));

app.use(express.static("public"));

var session = require("express-session");
const { v4: uuidv4 } = require("uuid");
app.use(
  session({
    secret: uuidv4(),
    resave: false,
    saveUninitialized: true,
  })
);
var passwordHash = require("password-hash"); //for generating the hashing password
app.get("/", function (req, res) {
  res.render("weatherhomepage.ejs");
});

app.get("/signup", function (req, res) {
  res.render("signuppage.ejs");
});

app.post("/signupsubmit", function (req, res) {
  db.collection("weatherinfo")
    .where("Email", "==", req.body.email)
    .get()
    .then((docs) => {
      if (docs.size > 0) {
        res.render("signuppage", { register: " email already registered" });
      } else {
        var hashedPassword = passwordHash.generate(req.body.password);
        console.log(hashedPassword);
        db.collection("weatherinfo")
          .add({
            Fullname: req.body.fullname,
            Email: req.body.email,
            password: hashedPassword,
          })
          .then(() => {
            res.redirect("/login");
          });
      }
    });
});

// db.collection("weatherinfo").add({
//   Fullname: req.query.fullname,
//   Email: req.query.email,
//   password: req.query.password,
// });
// res.redirect("/login");

app.get("/login", function (req, res) {
  res.render("loginpage.ejs");
});

app.post("/loginsubmit", function (req, res) {
  db.collection("weatherinfo")
    .where("Email", "==", req.body.email)
    .get()
    .then((docs) => {
      var verified = false;
      docs.forEach((doc) => {
        verified = passwordHash.verify(req.body.password, doc.data().password);
        //console.log(req.body.password);
        //console.log(verified);
      });
      if (verified) {
        req.session.user = req.body.email;
        res.redirect("/home");
      } else {
        res.send("please enter the valid ceredentials");
      }
    });
});

const apiKey = "aa725195ad9347e9bb1185802231209"; // Replace with your WeatherAPI key
const apiUrl = "https://api.weatherapi.com/v1/forecast.json";
app.get("/home", (req, res) => {
  if (req.session.user) {
    res.render("weatherLog.ejs");
  } else {
    res.send("invalid user");
  }
});
// Render Weather Dashboard
app.get("/dashboard", (req, res) => {
  if (req.session.user) {
    res.render("weatherfin.ejs", {
      sample: "",
      datetime: "",
      icon: "",
      temp: "",
      wind: "",
      humidity: "",
      place: "",
      forecastData: null,
    });
  } else {
    res.send("invalid user");
  }
});

// Fetch and Render Weather Data
app.post("/manual", async (req, res) => {
  const location = req.body.location;

  try {
    const currentResponse = await axios.get(
      `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${location}`
    );

    const forecastResponse = await axios.get(apiUrl, {
      params: {
        key: apiKey,
        q: location,
        days: 4,
      },
    });

    const forecastData = forecastResponse.data.forecast.forecastday.map(
      (day) => {
        return {
          date: day.date,
          description: day.day.condition.icon,
          temperature: day.day.avgtemp_c,
          humidity: day.day.avghumidity,
          wind: day.day.maxwind_mph,
        };
      }
    );
    db.collection("weatherHistory").add({
      userID: req.session.user,
      location: location,
      temperature: currentResponse.data.current.temp_c,
      icon: currentResponse.data.current.condition.icon,
      wind: currentResponse.data.current.wind_mph,
      humidity: currentResponse.data.current.humidity,
    });
    res.render("weatherfin.ejs", {
      temp: currentResponse.data.current.temp_c,
      icon: currentResponse.data.current.condition.icon,
      wind: currentResponse.data.current.wind_mph,
      humidity: currentResponse.data.current.humidity,
      place: location,
      datetime: currentResponse.data.location.localtime,
      forecastData: forecastData,
    });
  } catch (error) {
    console.log(error.message);
    res.render("weatherfin.ejs", { sample: "Error in fetching weather data" });
  }
});
app.get("/history", async (req, res) => {
  try {
    const snapshot = await db
      .collection("weatherHistory")
      .where("userID", "==", req.session.user)
      .get();
    const weatherData = [];
    const uniqueCities = new Set();
    snapshot.forEach((doc) => {
      const data = doc.data();
      const city = data.location;

      // Check if this city has already been added
      if (!uniqueCities.has(city)) {
        weatherData.push(data);
        uniqueCities.add(city); // Add the city to the set to mark it as seen
      }
    });

    res.render("history.ejs", { weatherData }); // Render the "index.ejs" template with weatherData
  } catch (error) {
    console.error("Error fetching data from Firestore:", error);
    res.status(500).send("Internal Server Error");
  }
});
app.get("/logout", (req, res) => {
  req.session.destroy(function (err) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      res.render("loginpage", { logout: "logout Successful" });
    }
  });
});

app.listen(3000, function () {
  console.log("Example app listening on port 3000!");
});
