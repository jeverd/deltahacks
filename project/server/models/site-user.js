/* eslint-disable max-len */
'use strict';

const multiparty = require('multiparty');
var AWS = require('aws-sdk');
var audiosprite = require('audiosprite');
const fs = require('fs');
const async = require('async');
const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();
const uuidv4 = require('uuid/v4');
const Clarifai = require('clarifai');
const cheerio = require('cheerio');
const request = require('request');
const appLb = require('.././server');


var s3 = new AWS.S3();

module.exports = function(Siteuser) {
  Siteuser.remoteMethod('getFood', {
    http: {path: '/:id/getFood', verb: 'post'},
    // eslint-disable-next-line max-len
    description: 'Used to obtain full name, and profile_image, to store in async storage',
    accepts: [
                {arg: 'id', type: 'number', required: true},
                {arg: 'base64', type: 'string', required: true},
    ],
    returns: {arg: 'result', type: 'Object'},
  });

  Siteuser.remoteMethod('manuallyGetFood', {
    http: {path: '/:id/manuallyGetFood', verb: 'post'},
    // eslint-disable-next-line max-len
    description: 'Used to obtain full name, and profile_image, to store in async storage',
    accepts: [
                {arg: 'id', type: 'number', required: true},
                {arg: 'query', type: 'string', required: true},
                {arg: 'mealName', type: 'string'},
                {arg: 'profile_id', type: 'number'},

    ],
    returns: {arg: 'result', type: 'Object'},
  });

  Siteuser.manuallyGetFood = (id, query, mealName, profile_id, cb) => {
    var totalCalories;
    var totalGL = 0;
    var totalSugar;
    let url = 'https://api.edamam.com/api/nutrition-details?app_id=47379841&app_key=d28718060b8adfd39783ead254df7f92';
    // if (!query.includes('and')) {
    //   return cb('ERROR: NOT CORRECT FORMAT');
    // };

    var foodNames = query.split('and');

    let data = {
      ingr: foodNames,
    };
    var options = {
      uri: url,
      method: 'POST',
      json: data,
    };
    request(options, (err, response, body) => {
      totalCalories = body.calories;
      try {
        totalSugar = body.totalNutrients.SUGAR;
      } catch (e) {
        return cb('ERROR GETTING SUGAR');
      }
      async.eachSeries(body.ingredients, (food, lbcb) => {
        var actualFoodName = food.parsed[0].foodMatch;
        if (food.parsed[0].foodMatch.slice(-1) == 's') {
          actualFoodName = (food.parsed[0].foodMatch).substring(0, (food.parsed[0].foodMatch).length - 1);
        }
        console.log('the food is', actualFoodName);
        let url = 'http://www.glycemicindex.com/foodSearch.php?ak=list&food_name_search_type=cn&food_name=' + actualFoodName + '&gi_search_type=lte&gi=&gl_search_type=lte&gl=&country=&product_category=&lop=AND&find=Find+Records&page=1';
        request(url, (err, response, body) => {
          if (err) {
            lbcb('ERROR: UNABLE TO GET INDEX, PLEASE TRY AGAIN...');
          }
          console.log('--------------------------------------------------------------');
          var $ = cheerio.load(body);
          let table = $('tr');
          var i = 0;
          async.whilst(
                function test() {
                  try {
                    var condition = Object.keys(table[i].attribs).length == 0;
                    return condition;
                  } catch (e) {
                    console.log('ERROR');
                    return false;
                  };
                },
                function iter(callback) {
                  i++;
                  setTimeout(callback, 50);
                },
                function(err, n) {
                  try {
                    console.log(table[i].children[3].children[0].children[0].data);
                    console.log(food.parsed[0].nutrients['CHOCDF'].quantity);
                    let gi = parseInt(table[i].children[3].children[0].children[0].data, 10);
                    console.log('gi', gi);
                    let gL = (gi * parseInt(food.parsed[0].nutrients['CHOCDF'].quantity, 10)) / 100;
                    console.log('GL', gL);
                    totalGL = totalGL + gL;
                    // console.log(table[i].children[3].children[0].children[0].data);  // gets you the GI
                      // console.log(table[i].children[9].children[0].children[0].data); // GL
                    lbcb();
                  } catch (e) {
                    lbcb();
                  }
                }
              );
        });
      }, (err) => {
        if (err) {
          return cb(err);
        } else {
          const foodData = {
            totalCalories: totalCalories,
            totalSugar: typeof totalSugar !== 'undefined' ? totalSugar.quantity : '0',
            gL: totalGL,
            mealName: query,
          };
          console.log('CHecking ere');
          const foodAddedModel  = appLb.models.FoodAdded;
          foodAddedModel.create({calories: totalCalories, food_name: query, meal_name: mealName, sugar: totalSugar.quantity, gl: totalGL, profile_id: profile_id}, (err, result) => {
            console.log(err);
            return cb(null, result);
          });
        }
      });
    });
  };

  Siteuser.remoteMethod('getFoodAudio', {
    http: {path: '/:id/getFoodAudio', verb: 'post'},
    // eslint-disable-next-line max-len
    description: 'Used to obtain full name, and profile_image, to store in async storage',
    accepts: [
                {arg: 'id', type: 'number', required: true},
                {arg: 'base64', type: 'string', required: true},
    ],
    returns: {arg: 'result', type: 'Object'},
  });

  Siteuser.getFoodAudio = (id, base64, cb) => {
    // fs.writeFileSync('out.caf',)
    var totalCalories;
    var totalSugar;
    var totalGL = 0;
    var mealName;

    fs.writeFile('out.caf', base64, 'base64', (err) => {
      console.log(err);
      var files = ['out.caf'];
      var opts = {output: 'out'};
      audiosprite(files, opts, function(err, obj) {
        if (err) return console.error(err);
        console.log('eeeeee');
        console.log(JSON.stringify(obj, null, 2));
        const file = fs.readFileSync('out.mp3');
        const audioBytes = file.toString('base64');
        const audio = {
          content: audioBytes,
        };
        const config = {
          encoding: 'MP3',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
        };
        const requestAudio = {
          audio: audio,
          config: config,
        };
        client.recognize(requestAudio).then((response) => {
          let words = response[0].results[0].alternatives[0].transcript;
          let url = 'https://api.edamam.com/api/nutrition-details?app_id=47379841&app_key=d28718060b8adfd39783ead254df7f92';
          var foodNames = words.split('and');
          if (words.split('+').length > foodNames.length) {
            foodNames = words.split('+');
          }
          mealName = words;

          let data = {
            ingr: foodNames,
          };
          var options = {
            uri: url,
            method: 'POST',
            json: data,
          };
          request(options, (err, response, body) => {
            console.log(err);
            try {
              totalCalories = body.calories;
              totalSugar = body.totalNutrients.SUGAR;
              var foodObject = [];
            } catch (e) {
              return cb('ERROR CANT GET SUGAR');
            }

            async.eachSeries(body.ingredients, (food, lbcb) => {
              var actualFoodName = food.parsed[0].foodMatch;
              if (food.parsed[0].foodMatch.slice(-1) == 's') {
                actualFoodName = (food.parsed[0].foodMatch).substring(0, (food.parsed[0].foodMatch).length - 1);
              }
              console.log('the food is', actualFoodName);
              let url = 'http://www.glycemicindex.com/foodSearch.php?ak=list&food_name_search_type=cn&food_name=' + actualFoodName + '&gi_search_type=lte&gi=&gl_search_type=lte&gl=&country=&product_category=&lop=AND&find=Find+Records&page=1';
              request(url, (err, response, body) => {
                if (err) {
                  lbcb('ERROR: UNABLE TO GET INDEX, PLEASE TRY AGAIN...');
                }
                console.log('--------------------------------------------------------------');
                var $ = cheerio.load(body);
                let table = $('tr');
                var i = 0;
                async.whilst(
                  function test() {
                    try {
                      var condition = Object.keys(table[i].attribs).length == 0;
                      return condition;
                    } catch (e) {
                      console.log('PROBLEM HERE');
                      return false;
                    };
                  },
                  function iter(callback) {
                    i++;
                    setTimeout(callback, 50);
                  },
                  function(err, n) {
                    if (err) {
                      return cb(err);
                    } else {
                      try {
                        console.log(table[i].children[3].children[0].children[0].data);
                        console.log(food.parsed[0].nutrients['CHOCDF'].quantity);
                        let gi = parseInt(table[i].children[3].children[0].children[0].data, 10);
                        console.log('gi', gi);
                        let gL = (gi * parseInt(food.parsed[0].nutrients['CHOCDF'].quantity, 10)) / 100;
                        console.log('GL', gL);
                        totalGL = totalGL + gL;
                        foodObject.push({gi: table[i].children[3].children[0].children[0].data, gl: table[i].children[9].children[0].children[0].data, foodName: food.parsed[0].foodMatch});
                        // console.log(table[i].children[3].children[0].children[0].data);  // gets you the GI
                        // console.log(table[i].children[9].children[0].children[0].data); // GL
                        lbcb();
                      } catch (e) {
                        lbcb();
                      }
                    }
                  }
                );
              });
            }, (err) => {
              if (err) {
                console.log('IN ERROR FOR ELSE');
                return cb(err);
              } else {
                console.log('the sugar is', totalSugar);
                const foodData = {
                  totalCalories: totalCalories,
                  totalSugar: typeof totalSugar !== 'undefined' ? totalSugar.quantity : '0',
                  gL: totalGL,
                  mealName: mealName,
                };
                console.log(foodData);
                return cb(null, foodData);
              }
            });
          });
        })
        .catch(err => console.log(err));
      });
    });
  };

  Siteuser.getFood = (id, base64, cb) => {
    // step #1: Get upload to console
    var fileName = uuidv4();
    var totalCalories;
    var totalSugar;
    var totalGL;
    var mealName;
    var buf = new Buffer(base64, 'base64'); // Ta-da

    uploadFiletoS3(buf, fileName, (err, result) => {
      if (err) {
        console.log(err);
        return cb('ERRROR');
      };
      console.log(result);
      app.models.predict('bd367be194cf45149e75f01d59f77ba7', result.Location)
      .then((response) => {
        var foodName =  response.outputs[0].data.concepts[0].name;
        let nutritionData = {
          ingr: foodName,
        };
        console.log(foodName);
        let urlNutrition = 'https://api.edamam.com/api/food-database/parser?ingr='  + foodName + '&app_id=4981c987&app_key=afc87aa587827edc35d3e532003c2077';
        var options = {
          uri: urlNutrition,
          method: 'GET',
          json: nutritionData,
        };
        request(options, (err, response, body) => {
          try {
            totalCalories = body.parsed[0].food.nutrients.ENERC_KCAL;
            totalSugar = body.parsed[0].food.nutrients.CHOCDF || 'N/A';
            mealName = foodName;
          } catch (e) {
            return cb('ERROR WITH API');
          }

          let url = 'http://www.glycemicindex.com/foodSearch.php?ak=list&food_name_search_type=cn&food_name=' + foodName + '&gi_search_type=lte&gi=&gl_search_type=lte&gl=&country=&product_category=&lop=AND&find=Find+Records&page=1';
          request(url, (err, response, body) => {
            var $ = cheerio.load(body);
            let table = $('tr');
            var i = 0;
            async.whilst(
              function test() {
                try {
                  var condition = Object.keys(table[i].attribs).length == 0;
                  return condition;
                } catch (e) {
                  console.log('ERROR');
                  return cb('ERROR');
                }
              },
              function iter(callback) {
                i++;
                setTimeout(callback, 100);
              },
              function(err, n) {
                var gI = parseInt(table[i].children[3].children[0].children[0].data, 10);  // gets you the GI
                let gL = (gI * parseInt(totalSugar, 10)) / 100;

                // console.log(table[i].children[9].children[0].children[0].data); // GL
                const foodData = {
                  totalCalories: totalCalories,
                  totalSugar: totalSugar,
                  gL: gL,
                //   gI: table[i].children[3].children[0].children[0].data,
                  mealName: mealName,
                };
                console.log(foodData);
                cb(null, foodData);
              }
            );
          });
        });
      })
      .catch(err => console.log(err));
    });
  };
};

const uploadFiletoS3 = (file, fileName, cb) => {
  s3.upload({
    Bucket: 'pysfy',
    ACL: 'public-read',  // important or else people won't be access it
    Key: fileName,
    Body: file,
  }, (err, result) => {
    cb(err, result);
  });
};
