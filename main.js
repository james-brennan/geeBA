
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

var geometry = ee.Geometry.Point([86.55861, 67.47194]);

Map.setCenter(86.55861, 67.47194,  3);





/*
Get Sentinel 2
*/
var collection = ee.ImageCollection('COPERNICUS/S2')
 .filterDate('2016-07-04', '2016-09-04')
 .filterBounds(geometry).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
 .filter(ee.Filter.eq('GEOMETRIC_QUALITY_FLAG', 'PASSED'));
 

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

More than one image seems to get through
the filtering at present
so we may end up with

B1_2 

when we should just have B1_1 and B1

So let's filter out 




--> Later on we may wish to select the best somehow
  --> this may be doable based on the masking procedure
    from earlier...

    eg select clearest image of the possible three/four
*/


var justTwoFilter = function(image) {
  /*

  This filter removes any additional images beyond
  B(x)_1


  -- need to do better?
  */
  var bands = ["B1", "B2", "B3", "B4", "B5", "B6",
              "B7", "B8", "B8A", "B9", "B10", "B11", "B12",
              "B1_1", "B2_1", "B3_1", "B4_1", "B5_1", "B6_1",
              "B7_1", "B8_1", "B8A_1", "B9_1", "B10_1", "B11_1", "B12_1"];
  var newCol = image.select(bands);
  return newCol
}

// apply this filter

var mergedLess  = merged17.map(justTwoFilter);


/*
The differencer adds the difference pre and 
post to the image collection
*/
var difference = function(image) {
  var preB = ["B1", "B2", "B3", "B4", "B5", "B6",
              "B7", "B8", "B8A", "B9", "B10", "B11", "B12"];
  var posB = ["B1_1", "B2_1", "B3_1", "B4_1", "B5_1", "B6_1",
              "B7_1", "B8_1", "B8A_1", "B9_1", "B10_1", "B11_1", "B12_1"];
  var diffname = ["d_B1", "d_B2", "d_B3", "d_B4", "d_B5", "d_B6",
              "d_B7", "d_B8", "d_B8A", "d_B9", "d_B10", "d_B11", "d_B12"];

  var outnames = ["pre_B1", "pre_B2", "pre_B3", "pre_B4", "pre_B5", "pre_B6",
              "pre_B7", "pre_B8", "pre_B8A", "pre_B9", "pre_B10", "pre_B11", "pre_B12",
              "post_B1_1", "post_B2_1", "post_B3_1", "post_B4_1", "post_B5_1", "post_B6_1",
              "post_B7_1", "post_B8_1", "post_B8A_1", "post_B9_1", "post_B10_1", "post_B11_1", "post_B12_1",
              "d_B1", "d_B2", "d_B3", "d_B4", "d_B5", "d_B6",
              "d_B7", "d_B8", "d_B8A", "d_B9", "d_B10", "d_B11", "d_B12"];

  var pre = image.select(preB)
  var post = image.select(posB)
  var diff = pre.subtract(post);
  return image.addBands(diff).rename(outnames);
};


/*
Run the differencer
*/
var difftest = mergedLess.map(difference);




/*


write expl


*/

var elementMaker1 = function (diff1, n) {
    /*
    This returns a feature for
    putting into the imageCollection



    ADD MORE Documentations

    */
    var a0_coeffs = [1,1,1,1,1,1,1,1,1,1,1,1];
    var a1_coeffs = ee.List([0.05412218,  0.11710486,  0.19      ,
                       0.30329678,  0.34379875,  0.38004061,
                       0.42097412,  0.469925  ,  0.49660975, 
                       0.56522461, 0.84667881,  0.94170793,  
                       0.98399775]);

    var preFire = diff1.select(["pre_BX".replace("X",n)]);
    var postFire = diff1.select(["post_BX_1".replace("X",n)]);
    var dFire = diff1.select(["d_BX".replace("X",n)]);
    var a0 = ee.Image.constant(1.000001);
    var a1 = ee.Image.constant(a1_coeffs.get(parseInt(n, 10)-1)).toDouble();
    var imm = ee.Image([preFire, postFire, dFire ])
    
    
    return imm.addBands(a0) 
              .addBands(a1 )
              .rename(["pre", "post", "delta", "a0", "a1"])
};


var runner = function(image) {
  /*
  This runs the extra hack setup and then
  runs the fcc model!
  

  RETURN RESIDUALS!
  */
    var newFeature =  ee.FeatureCollection([
                    elementMaker1(image, '8'),
                    elementMaker1(image, '8A'),
                    elementMaker1(image, '9'),
                    elementMaker1(image, '10'),
                    elementMaker1(image, '11'),
                    elementMaker1(image, '12')]);           
    //print(newFeature);
    var f = ee.ImageCollection(newFeature);
    var uuu = f.select(['a0', 'a1', 'pre', 'delta']);
    var trend = uuu.reduce(ee.Reducer.linearRegression(3, 1));

    // Flatten the coefficients into a 2-band image
    var coefficients = trend.select('coefficients')
      .arrayProject([0])
      .arrayFlatten([['x1', 'x2', 'x3']]);
    /*
    convert these to the true things
    */
    var fcc = coefficients.select("x1").multiply(-1);
    var a0 = coefficients.select("x2").divide(fcc);
    var a1 = coefficients.select("x3").divide(fcc);
    var imm = ee.Image([fcc, a0, a1]).rename(['fcc', 'a0', 'a1']);
    return imm
}


/*
Map over difftest
*/

var output = difftest.map(runner);
print(output);


Map.addLayer(output);

var diff1 = ee.Image(difftest.first());

//var test = runner(diff1);
print (test);
