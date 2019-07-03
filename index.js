( function ( $, L, prettySize ) {
	var map, heat,
		heatOptions = {
			tileOpacity: 1,
			heatOpacity: 1,
			radius: 25,
			blur: 15
		};

	var grid = codegrid.CodeGrid();

	function status( message ) {
		$( '#currentStatus' ).text( message );
	}
	// Start at the beginning
	stageOne();

	function stageOne () {
		var dropzone;

		// Initialize the map
		map = L.map( 'map' ).setView( [0,0], 2 );
		L.tileLayer( 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: 'location-history-visualizer is open source and available <a href="https://github.com/theopolisme/location-history-visualizer">on GitHub</a>. Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors.',
			maxZoom: 18,
			minZoom: 2
		} ).addTo( map );

		// Initialize the dropzone
		dropzone = new Dropzone( document.body, {
			url: '/',
			previewsContainer: document.createElement( 'div' ), // >> /dev/null
			clickable: false,
			accept: function ( file, done ) {
				stageTwo( file );
				dropzone.disable(); // Your job is done, buddy
			}
		} );

		// For mobile browsers, allow direct file selection as well
		$( '#file' ).change( function () {
			stageTwo( this.files[0] );
			dropzone.disable();
		} );
	}

	function stageTwo ( file ) {
    // Google Analytics event - heatmap upload file

		heat = L.heatLayer( [], heatOptions ).addTo( map );

		var type;

		try {
			if ( /\.kml$/i.test( file.name ) ) {
				type = 'kml';
			} else {
				type = 'json';
			}
		} catch ( ex ) {
			status( 'Something went wrong generating your map. Ensure you\'re uploading a Google Takeout JSON file that contains location data and try again, or create an issue on GitHub if the problem persists. ( error: ' + ex.message + ' )' );
			return;
		}

		// First, change tabs
		$( 'body' ).addClass( 'working' );
		$( '#intro' ).addClass( 'hidden' );
		$( '#working' ).removeClass( 'hidden' );

		var SCALAR_E7 = 0.0000001; // Since Google Takeout stores latlngs as integers
		var latlngs = [];

		var os = new oboe();
		var myLocList = {};
		var countryList = {};
		var yearList = {};

		var getDayOfYear = (date) => {
			var start = new Date(date.getFullYear(), 0, 0);
			var diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
			var oneDay = 1000 * 60 * 60 * 24;
			var day = Math.floor(diff / oneDay);
			return day;
		}

		var myProccessFunc = (key, date, lat, lon) => {
			grid.getCode(lat, lon, (error, code) => { 
				if (!(code in myLocList[key].countries)) {
					myLocList[key].countries[code] = true;
						
					if (!(date.getFullYear() in yearList)) {
						yearList[date.getFullYear()] = {count:0};
					}
					var dayOfYear = getDayOfYear(date);
					if (!(dayOfYear in yearList[date.getFullYear()])) {
						yearList[date.getFullYear()][dayOfYear] = true;
						yearList[date.getFullYear()].count++;
					}

					if (!(code in countryList)) {
						countryList[code] = {count: 0};
					}
					var c = countryList[code];

					if (!(date.getFullYear() in c)) {
						c[date.getFullYear()] = { count: 0, days: {}};
					}
					var y = c[date.getFullYear()];

					if (!(date.getMonth() in y)) {
						y[date.getMonth()] = { count: 0};
					}
					var m = y[date.getMonth()];

					if (!(date.getDate() in m)) {
						m[date.getDate()] = true;
						m.count++;
						y.count++;
						c.count++;
					}
				}
			});
		}

		os.node( 'locations.*', function ( location ) {
			var latitude = location.latitudeE7 * SCALAR_E7,
				longitude = location.longitudeE7 * SCALAR_E7,
				date = new Date(Number(location.timestampMs));

			// Handle negative latlngs due to google unsigned/signed integer bug.
			if ( latitude > 180 ) latitude = latitude - (2 ** 32) * SCALAR_E7;
			if ( longitude > 180 ) longitude = longitude - (2 ** 32) * SCALAR_E7;
			
			f = (n) => { if ( n >= 10) return n.toString(); else return "0" + n.toString() }

			var dateKey = date.getFullYear() + "-" + f(date.getMonth()) + "-" + f(date.getDate());

			if (!(dateKey in myLocList)) {
				myLocList[dateKey] = { countries: {} };			
			}

			myProccessFunc(dateKey, date, latitude, longitude);

			if ( type === 'json' ) latlngs.push( [ latitude, longitude ] );
			return oboe.drop;
		} ).done( function () {
			status( 'Generating map...' );
			heat._latlngs = latlngs;

			heat.redraw();
			console.log(myLocList);
			console.log(countryList);
			console.log(yearList);

			var yearCountryList = {}
			Object.keys(countryList).forEach( (keyCountry) => {
				Object.keys(countryList[keyCountry]).forEach( (keyYear) => {
					if (keyYear === 'count') {
						console.log("Days spent in " + keyCountry + " in total: " + countryList[keyCountry].count);
						return;
					}

					if (!(keyYear in yearCountryList)) {
						yearCountryList[keyYear] = {}
					}

					yearCountryList[keyYear][keyCountry] = countryList[keyCountry][keyYear].count;
				})
			})
			
			var dateFromDay = (year, day) => {
				var date = new Date(year, 0); // initialize a date in `year-01-01`
				return new Date(date.setDate(day)); // add the number of days
			}

			Object.keys(yearCountryList).forEach( (keyYear) => {
				Object.keys(yearCountryList[keyYear]).forEach( (keyCountry) => {
					console.log("Days spent in " + keyCountry + " in " + keyYear + ": " + yearCountryList[keyYear][keyCountry]);
				});
				
				var totalDays = 365 + (keyYear % 4 == 0 ? 1 : 0);
				var today = new Date(Date.now());
				totalDays = keyYear == today.getFullYear() ? getDayOfYear(today) : totalDays;

				console.log("Filled days in " + keyYear + ": " + yearList[keyYear].count);
				console.log("Missing days in " + keyYear + ": " + (totalDays - yearList[keyYear].count));
				for (var i = 1; i <= totalDays; ++i) {
					if (!(i in yearList[keyYear])) {
						console.log("Missing day in " + keyYear + ": " + dateFromDay(keyYear, i));
					}
				}

				console.log("-----------------")
			})
			stageThree(  /* numberProcessed */ latlngs.length );

		} );

		var fileSize = prettySize( file.size );

		status( 'Preparing to import file ( ' + fileSize + ' )...' );

		// Now start working!
		if ( type === 'json' ) parseJSONFile( file, os );
		if ( type === 'kml' ) parseKMLFile( file );
	}

	function stageThree ( numberProcessed ) {
		// Google Analytics event - heatmap render

		var $done = $( '#done' );

		// Change tabs :D
		$( 'body' ).removeClass( 'working' );
		$( '#working' ).addClass( 'hidden' );
		$done.removeClass( 'hidden' );

		// Update count
		$( '#numberProcessed' ).text( numberProcessed.toLocaleString() );

		$( 'body' ).addClass( 'map-active' );
		$done.fadeOut();
		activateControls();

		function activateControls () {
			var $tileLayer = $( '.leaflet-tile-pane' ),
				$heatmapLayer = $( '.leaflet-heatmap-layer' ),
				originalHeatOptions = $.extend( {}, heatOptions ); // for reset

			// Update values of the dom elements
			function updateInputs () {
				var option;
				for ( option in heatOptions ) {
					if ( heatOptions.hasOwnProperty( option ) ) {
						document.getElementById( option ).value = heatOptions[option];
					}
				}
			}

			updateInputs();

			$( '.control' ).change( function () {
				switch ( this.id ) {
					case 'tileOpacity':
						$tileLayer.css( 'opacity', this.value );
						break;
					case 'heatOpacity':
						$heatmapLayer.css( 'opacity', this.value );
						break;
					default:
						heatOptions[ this.id ] = Number( this.value );
						heat.setOptions( heatOptions );
						break;
				}
			} );

			$( '#reset' ).click( function () {
				$.extend( heatOptions, originalHeatOptions );
				updateInputs();
				heat.setOptions( heatOptions );
				// Reset opacity too
				$heatmapLayer.css( 'opacity', originalHeatOptions.heatOpacity );
				$tileLayer.css( 'opacity', originalHeatOptions.tileOpacity );
			} );
		}
	}

	/*
	Break file into chunks and emit 'data' to oboe instance
	*/

	function parseJSONFile( file, oboeInstance ) {
		var fileSize = file.size;
		var prettyFileSize = prettySize(fileSize);
		var chunkSize = 512 * 1024; // bytes
		var offset = 0;
		var self = this; // we need a reference to the current object
		var chunkReaderBlock = null;
		var startTime = Date.now();
		var endTime = Date.now();
		var readEventHandler = function ( evt ) {
			if ( evt.target.error == null ) {
				offset += evt.target.result.length;
				var chunk = evt.target.result;
				var percentLoaded = ( 100 * offset / fileSize ).toFixed( 0 );
				status( percentLoaded + '% of ' + prettyFileSize + ' loaded...' );
				oboeInstance.emit( 'data', chunk ); // callback for handling read chunk
			} else {
				return;
			}
			if ( offset >= fileSize ) {
				oboeInstance.emit( 'done' );
				return;
			}

			// of to the next chunk
			chunkReaderBlock( offset, chunkSize, file );
		}

		chunkReaderBlock = function ( _offset, length, _file ) {
			var r = new FileReader();
			var blob = _file.slice( _offset, length + _offset );
			r.onload = readEventHandler;
			r.readAsText( blob );
		}

		// now let's start the read with the first block
		chunkReaderBlock( offset, chunkSize, file );
	}

	/*
        Default behavior for file upload (no chunking)	
	*/

	function parseKMLFile( file ) {
		var fileSize = prettySize( file.size );
		var reader = new FileReader();
		reader.onprogress = function ( e ) {
			var percentLoaded = Math.round( ( e.loaded / e.total ) * 100 );
			status( percentLoaded + '% of ' + fileSize + ' loaded...' );
		};

		reader.onload = function ( e ) {
			var latlngs;
			status( 'Generating map...' );
			latlngs = getLocationDataFromKml( e.target.result );
			heat._latlngs = latlngs;
			heat.redraw();
			stageThree( latlngs.length );
		}
		reader.onerror = function () {
			status( 'Something went wrong reading your JSON file. Ensure you\'re uploading a "direct-from-Google" JSON file and try again, or create an issue on GitHub if the problem persists. ( error: ' + reader.error + ' )' );
		}
		reader.readAsText( file );
	}

	var locationsv2 = [];

	function getLocationDataFromKml( data ) {
		var KML_DATA_REGEXP = /<when>( .*? )<\/when>\s*<gx:coord>( \S* )\s( \S* )\s( \S* )<\/gx:coord>/g,
			locations = [],
			match = KML_DATA_REGEXP.exec( data );


		locationsv2 = [];

		// match
		//  [ 1 ] ISO 8601 timestamp
		//  [ 2 ] longitude
		//  [ 3 ] latitude
		//  [ 4 ] altitude ( not currently provided by Location History )
		while ( match !== null ) {
			locations.push( [ Number( match[ 3 ] ), Number( match[ 2 ] ) ] );
			locationsv2.push({ date: new Date(match[1]), lat: Number(match[3]), lon: Number(match[2])});
			
			match = KML_DATA_REGEXP.exec( data );
		}

		return locations;
	}

}( jQuery, L, prettySize ) );
