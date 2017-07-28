function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function getParametersByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var matches = [];
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)", "g");
    var match = regex.exec(location.search);
    while (match != null) {
	    matches.push(match[1]);
	    match = regex.exec(location.search);
    }
    if ( matches.length < 1 ) {
	    return null;
    }
    
    return matches.map(function(match) {
	    return decodeURIComponent(match.replace(/\+/g, " "));
    });
}

function PDRequest(token, endpoint, method, options) {

	if ( !token ) {
		alert("Please put a token in the URL, like .../index.html?token=<YOUR_V2_API_TOKEN>");
		return;
	}

	var merged = $.extend(true, {}, {
		type: method,
		dataType: "json",
		url: "https://api.pagerduty.com/" + endpoint,
		headers: {
			"Authorization": "Token token=" + token,
			"Accept": "application/vnd.pagerduty+json;version=2"
		},
		error: function(err, textStatus) {
			$('.busy').hide();
			var alertStr = "Error '" + err.status + " - " + err.statusText + "' while attempting " + method + " request to '" + endpoint + "'";
			try {
				alertStr += ": " + err.responseJSON.error.message;
			} catch (e) {
				alertStr += ".";
			}
			
			try {
				alertStr += "\n\n" + err.responseJSON.error.errors.join("\n");
			} catch (e) {}

			console.log(alertStr);
		}
	},
	options);

	$.ajax(merged);
}

function hourNumberToString(n, long) {
	var m = (n > 12) ? "p" : "a";
	var h = (n % 12 == 0) ? 12 : n % 12;
	
	if (long) { return h + ":00" + m + "m"; }
	else { return h + m }
}

function dayNumberToString(n, long) {
	var dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	var dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	
	if (long) { return dayNames[n]; }
	else { return dayNamesShort[n]; }
}

function fetch(endpoint, params, callback, progressCallback) {
	var limit = 100;
	var infoFns = [];
	var fetchedData = [];

	var commonParams = {
			total: true,
			limit: limit
	};

	var getParams = $.extend(true, {}, params, commonParams);

	var options = {
		data: getParams,
		success: function(data) {
			var total = data.total;
			Array.prototype.push.apply(fetchedData, data[endpoint]);

			if ( data.more == true ) {
				var indexes = [];
				for ( i = limit; i < total; i += limit ) {
					indexes.push(Number(i));
				}
				indexes.forEach(function(i) {
					var offset = i;
					infoFns.push(function(callback) {
						var options = {
							data: $.extend(true, { offset: offset }, getParams),
							success: function(data) {
								Array.prototype.push.apply(fetchedData, data[endpoint]);
								if (progressCallback) {
									progressCallback(data.total, fetchedData.length);
								}
								callback(null, data);
							}
						}
						PDRequest(getParameterByName('token'), endpoint, "GET", options);
					});
				});

				async.parallel(infoFns, function(err, results) {
					callback(fetchedData);
				});
			} else {
				callback(fetchedData);
			}
		}
	}
	PDRequest(getParameterByName('token'), endpoint, "GET", options);
}

function fetchLogEntries(since, until, callback, progressCallback) {
	var params = {
		since: since.toISOString(),
		until: until.toISOString(),
		is_overview: false
	}
	fetch('log_entries', params, callback, progressCallback);
}

function fetchIncidents(since, until, callback, progressCallback) {
	var params = {
		since: since.toISOString(),
		until: until.toISOString()
	}
	fetch('incidents', params, callback, progressCallback);
}
