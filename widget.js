var fs = require("fs");
var path = require("path");
var when = require("when");
var express = require("express");
var bodyParser = require("body-parser");
var http = require("http");
var request = require("request");
var passport = require("passport");
var needsPermission = require("ubicall-oauth").needsPermission;
var settings = require("./settings");
var genWidget = require("./genWidget");
var log = require("./log");


var platformApp = express();

var server = http.createServer(function(req, res) {
  platformApp(req, res);
});


platformApp.use(bodyParser.json());
platformApp.use(bodyParser.urlencoded({
  extended: false
}));
platformApp.use(passport.initialize());


function extractIvr(req, res, next) {
  if (!req.params.version) {
    res.status(422).json({
      message: "Validation Failed",
      errors: [{
        field: "version",
        code: "missing_field"
      }]
    });
  }
  next();
}


function __fetchPlist(plistUrl, authz) {
    return when.promise(function(resolve, reject) {
        log.verbose("fetching plist from " + plistUrl);
        request({
            url: plistUrl,
            method: "GET",
            headers: {
                Authorization: authz
            }
        }, function(error, response, body) {
            if (error || response.statusCode !== 200) {
                return reject(error || response.statusCode);
            }
            return resolve(body);
        });
    });
}

function updateWidget(req, res, next) {
  var plistUrl = settings.plistHost + req.params.version;
  var authz = req.user.authz;
  log.verbose("working on updating widget from plist at " + plistUrl);
  __fetchPlist(plistUrl, authz).then(function(plist){
    genWidget.parsePlist(plist).then(function(){
      log.info("Widget generated successfully from " + plistUrl);
      res.status(200).json({
        message: "Widget generated successfully"
      });
    }).otherwise(function(err){
      log.error("Error generating widget from " + plistUrl + " " + err);
      res.status(500).json({
        message: "Error generating widget , plist may be courrpted"
      });
    });
  }).otherwise(function(err){
    log.error("Error fetching widget from " + plistUrl + " " + err);
    res.status(500).json({
      message: "Error fetching widget from " + plistUrl
    });
  });
}

platformApp.post("/api/widget/:version", needsPermission("ivr.write"), extractIvr, updateWidget);
platformApp.put("/api/widget/:version", needsPermission ("ivr.write"), extractIvr, updateWidget);


function getListenPath() {
  var listenPath = "http" + (settings.https ? "s" : "") + "://" +
    (settings.host === "0.0.0.0" ? "127.0.0.1" : settings.host) +
    ":" + settings.port || 7575;
  return listenPath;
}


server.on("error", function(err) {
  if (err.errno === "EADDRINUSE") {
    log.error("Unable to listen on " + getListenPath());
    log.error("Error: port in use");
  } else {
    log.error("Uncaught Exception:");
    if (err.stack) {
      log.error(err.stack);
    } else {
      log.error(err);
    }
  }
  process.exit(1);
});


server.listen(settings.port || 7575, settings.host || "0.0.0.0", function() {
  process.title = "widget";
  log.info("Server use configuration version " + process.env.config_version);
  log.info("Server running now on " + process.env.node_env + " Mode - Avialable options are : test ,development ,production ");
  log.info("Server now running at " + getListenPath());
  log.help("To stop app gracefully just type in shell pkill widget");
});

process.on("uncaughtException", function(err) {
  log.error("[Widget] Uncaught Exception:");
  if (err.stack) {
    log.error(err.stack);
  } else {
    log.error(err);
  }
  process.exit(1);
});

process.on("unhandledRejection", function(err) {
  log.error("[Widget] unhandled Rejection:");
  if (err.stack) {
    log.error(err.stack);
  } else {
    log.error(err);
  }
});

process.on("SIGINT", function() {
  process.exit();
});
