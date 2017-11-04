
/*

This is a first try implementation of an fcc
style BA on GEE for sentinel 2


using the fire from this post
http://www.cesbio.ups-tlse.fr/multitemp/?p=9250
*/



/*
Some setup
*/
var timeField = 'system:time_start';

Map.setCenter(86.55861, 67.47194,  3);





/*
Get Sentinel 2
*/
var collection = ee.ImageCollection('COPERNICUS/S2')
 .filterDate('2016-07-04', '2016-09-04')
 .filterBounds(geometry).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
 .filter(ee.Filter.eq('GEOMETRIC_QUALITY_FLAG', 'PASSED'));
 
print(collection);

/*
Re-scale to TOA
*/
var scale = function(image) {
  var scale = image.multiply(1.0/10000);
  return scale.copyProperties(image, ["system:time_start"]);
};

// re-scale
collection = collection.map(scale);


/*
Perform a simple cloud, snow, water,shadow masking 

Uses the decision tree from Figure 5 in:

Ready-to-Use Methods for the Detection of Clouds,
Cirrus, Snow, Shadow, Water and Clear Sky Pixels
in Sentinel-2 MSI Images

*/
var masker = function(image) {
  /*
  Perform the regression tree from
  the paper (fig 5)
  */
  // Get needed bands
  var B10 = image.select("B10");
  var B11 = image.select("B11");
  var B3 = image.select("B3");
  var B4 = image.select("B4");
  var B7 = image.select("B7");
  var B8a = image.select("B8A");

  // Level 1
  var level1 = B3.lt(0.325);

  // Level 2 rules
  var lvl2rule1 = B8a.lt(0.166).and(level1.eq(1));
  var lvl2rule2 = B11.lt(0.267).and(level1.eq(0));

  // Level 3 rules
  var lvl3rule1 = B8a.lt(0.039).and(lvl2rule1.eq(1));
  var lvl3rule2 = B10.lt(0.011).and(lvl2rule1.eq(0));
  var lvl3rule3 = B4.lt(0.674).and(lvl2rule2.eq(1));
  var lvl3rule4 = B7.lt(1.544).and(lvl2rule2.eq(0));

  // lvl3rule2 corresponds to clear
  var clear = lvl3rule2;

  // Update the mask
  return image.updateMask(clear);
}


// apply it
var collectionM = collection.map(masker);
//Map.addLayer(collection);

print(collectionM);


var b = collectionM.select("B4");
Map.addLayer(b, vis);


/*
taken from 
  merge code from
 https://docs.google.com/document/d/1mNIRB90jwLuASO1JYas1kuOXCLbOoy1Z4NlV1qIXM10/edit

  This code puts together the pre and post image into one image collection
  This makes the processing later on easier...
*/
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
    ascending: true, // Sort reverse chronologically
  }).apply({
    primary: leftCollection, 
    secondary: rightCollection, 
    condition: filter
  });
};



var lagged17 = lag(collectionM, collectionM, 10);

print(lagged17);
 


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
var dependent = ee.String('B12');
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
  var pre = image.select("B12")
  var post = image.select("B12_1")
  var diff = pre.subtract(post);
  return diff
};


// try and run over the collection
var dependent = ee.String('B12');
var lagBand = dependent.cat('_1');
var difftest = prePostBandCollection.map(difference);


var im = difftest.select("B12");

var vis = {min:-1, max:1};
Map.addLayer(im, vis);

print (difftest);