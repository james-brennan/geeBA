
// taken from 
// https://docs.google.com/document/d/1mNIRB90jwLuASO1JYas1kuOXCLbOoy1Z4NlV1qIXM10/edit

var timeField = 'system:time_start';


var lag = function(leftCollection, rightCollection, lagDays) {
  var filter = ee.Filter.and(
    ee.Filter.maxDifference({
      difference: 1000 * 60 * 60 * 24 * lagDays,
      leftField: timeField, 
      rightField: timeField
    }), 
    ee.Filter.greaterThan({
      leftField: timeField, 
      rightField: timeField
  }));
  
  return ee.Join.saveAll({
    matchesKey: 'images',
    measureKey: 'delta_t',
    ordering: timeField, 
    ascending: false, // Sort reverse chronologically
  }).apply({
    primary: leftCollection, 
    secondary: rightCollection, 
    condition: filter
  });
};



// So get the previous image


// Create a Landsat 7 composite for Spring of 2000, and filter by
// the bounds of the FeatureCollection.
var collection = ee.ImageCollection('COPERNICUS/S2')
 .filterDate('2016-04-01', '2016-06-01')
 .filterBounds(geometry);


/*

Cloud mask
*/
// cloudMask
function cloudMask(collection) {
  // Opaque and cirrus cloud masks cause bits 10 and 11 in QA60 to be set,
  // so values less than 1024 are cloud-free
  var qa = collection.select('QA60');
  var mask = ee.Image(0).where(qa.gte(1024), 1).not();
  return collection.updateMask(mask);
}
 
// remove clouds for all images
//collection = cloudMask(collection);


collection = collection.map(cloudMask);

Map.addLayer(collection); 

//var qa = collection.select('QA60');

//var test = qa.gte(1024);
 

var lagged17 = lag(collection, collection, 11);


 


var merge = function(image) {
  // Function to be passed to iterate.
  var merger = function(current, previous) {
    return ee.Image(previous).addBands(current);
  };
  return ee.ImageCollection.fromImages(
image.get('images')).iterate(merger, image);
};

var merged17 = ee.ImageCollection(lagged17.map(merge));

/*

This function gets one spectral band
and returns a collection of the pre and post bands

*/

var getPrePostBand = function(mergedCollection, band, lagBand) {
  return mergedCollection.select([band, lagBand])};


/*
Get Band 2
The Lag band is appended with _1
*/
var dependent = ee.String('B4');
var lagBand = dependent.cat('_1');

// do it
var prePostBandCollection = getPrePostBand(merged17, dependent, lagBand);






/*
Map which takes the two bands and generates a difference band
----
The collection is now each image which has the pre and post bands
----
*/

var difference = function(image) {
  var pre = image.select("B4")
  var post = image.select("B4_1")
  var diff = pre.subtract(post);
  return diff
};


// try and run over the collection

var dependent = ee.String('B2');
var lagBand = dependent.cat('_1');

var difftest = prePostBandCollection.map(difference);


//var pre = merged17.select(dependent);
//var post = merged17.select(lagBand);


//print (pre);
//print (post);



var im = difftest.select("B4");

var vis = {min:-100, max:100}
Map.addLayer(im, vis);

