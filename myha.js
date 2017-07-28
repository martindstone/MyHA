function compareCreatedAt(a, b) {
	return moment(a.created_at).diff(moment(b.created_at));
}


function fetchReportData(since, until, callback) {
	var progress = {
		incidents: {
			total: 0,
			done: 0
		},
		log_entries: {
			total: 0,
			done: 0
		}
	};

	async.parallel([
		function(callback) {
			fetchLogEntries(since, until, function(data) {
				callback(null, data);
			},
			function(total, done) {
				progress.log_entries.total = total;
				progress.log_entries.done = done;
				progress_percent = Math.round(( progress.incidents.done + progress.log_entries.done ) / ( progress.incidents.total + progress.log_entries.total ) * 100);
				$('#busy-percent').html(`<h1>${progress_percent}%</h1>`);
			});
		},
		function(callback) {
			fetchIncidents(since, until, function(data) {
				callback(null, data);
			},
			function(total, done) {
				progress.incidents.total = total;
				progress.incidents.done = done;
				progress_percent = Math.round(( progress.incidents.done + progress.log_entries.done ) / ( progress.incidents.total + progress.log_entries.total ) * 100);
				$('#busy-percent').html(`<h1>${progress_percent}%</h1>`);
			});
		}
	],
	function(err, results) {
		callback(results);
	});
}


function parseReportData(log_entries, fetchedIncidents) {
	$('#busy-message').html('<h1>Parsing incidents...</h1>');
	var incidentsDict = {};
	var incidents = [];

	fetchedIncidents.forEach(function (incident) {
		incidentsDict[incident.id] = incident;
		incidentsDict[incident.id].log_entries = [];
	});

	$('#busy-message').html('<h1>Adding log entries to incidents...</h1>');

	log_entries.forEach(function(le) {
		if ( incidentsDict[le.incident.id] ) {
			incidentsDict[le.incident.id]['log_entries'].push(le);
		}
	});

	$('#busy-message').html('<h1>Sorting incident log entries...</h1>');
	Object.keys(incidentsDict).forEach(function(id) {
		incidentsDict[id]['log_entries'].sort(compareCreatedAt);
		incidents.push(incidentsDict[id]);
	});

	$('#busy-message').html('<h1>Sorting incidents...</h1>');
	incidents.sort(compareCreatedAt);

	return incidents;
}


function visualize(incidents) {
	
	var defs = d3.select('.chart').append('defs');
	var filter = defs.append('filter').attr('id', 'darker');
	filter.append('feColorMatrix').attr('type', 'matrix')
		.attr('values', "0.3 0 0 0 0 0 0.3 0 0 0 0 0 0.3 0 0 0 0 0 1 0");

	var colors = {
		acknowledge_log_entry: "orange",
		annotate_log_entry: "lightslategray",
		assign_log_entry: "gold",
		escalate_log_entry: "darkred",
		exhaust_escalation_path_log_entry: "midnightblue",
		notify_log_entry: "lime",
		reach_trigger_limit_log_entry: "limegreen",
		repeat_escalation_path_log_entry: "cyan",
		resolve_log_entry: "green",
		snooze_log_entry: "orangered",
		trigger_log_entry: "red",
		unacknowledge_log_entry: "red"
	};
	
	var width = $(window).width() * 0.8;
	var rectHeight = 10;
	var height = rectHeight * incidents.length;

	var time_scale = d3.scaleTime().domain([moment().subtract(1, 'days').valueOf(), moment().valueOf()]).range([0,width]);

	var time_ticks = time_scale.ticks(d3.timeMinute.filter(function(d) {
		return d.getMinutes() % 60 === 0;
	}));

	var y = d3.scaleLinear().domain([0,incidents.length]).range([0,height]);

	var rects = [];
	incidents.forEach(function(incident, index) {
		console.log(`incident ${incident.id}: ${moment(incident.created_at).format('LLLL')} -> ${time_scale(moment(incident.created_at))}, ${y(index)}`);
		console.log(incident.log_entries[incident.log_entries.length - 1]);
		
		var majorles = incident.log_entries.filter(function(le) {
			var majortypes = [ "trigger_log_entry", "acknowledge_log_entry", "resolve_log_entry"];
			return majortypes.indexOf(le.type) >= 0;
		});
		
		majorles.forEach(function(le, i, les) {
			if ( i == les.length - 1) { 
				if ( le.type != "resolve_log_entry" ) {
					// still open
					rects.push({
						x: time_scale(moment(le.created_at)),
						y: y(index),
						width: time_scale(moment()) - time_scale(moment(le.created_at)),
						height: rectHeight,
						color: colors[le.type],
						starttime: le.created_at,
						endtime: moment().toISOString(),
						leSummary: le.summary,
						nextSummary: "Still open...",
						incidentSummary: incident.summary,
						service: incident.service
					});
				}
				
				return; 
			}
			
			rects.push({
				x: time_scale(moment(le.created_at)),
				y: y(index),
				width: time_scale(moment(les[i+1].created_at)) - time_scale(moment(le.created_at)),
				height: rectHeight,
				color: colors[le.type],
				starttime: le.created_at,
				endtime: les[i+1].created_at,
				leSummary: le.summary,
				nextSummary: les[i+1].summary,
				incidentSummary: incident.summary,
				incidentUrgency: incident.urgency,
				service: incident.service
			})
		})
	});

	var tooltip = d3.select("body").append("div")
			  .attr("class", "tooltip")
			  .style("opacity", 0);

	var chart = d3.select(".chart")
		.attr('width', width)
		.attr('height', rectHeight * incidents.length);
	var g = chart.selectAll("g")
		.data(rects)
		.enter()
		.append("g");

	var d3rects = g.append('rect')
		.attr('x', function(d) { return d.x; })
		.attr('y', function(d) { return d.y; })
		.attr('width', function(d) { return d.width; })
		.attr('height', function(d) { return d.height; })
		.attr('filter', function(d) { return d.incidentUrgency == "low" ? 'url(#darker)' : 'none' })
		.style('fill', function(d) { return d.color; })
//		.style('opacity', function(d) { return d.incidentUrgency == "high" ? 1.0 : 0.5})
		.on("mouseover", function(d) {
			console.log(d);
			d3.select(this).attr('stroke', 'black');
			tooltip.transition()
				.duration(50)
				.style("opacity", .9);
			tooltip.html('<b>' + d.incidentSummary + (d.incidentUrgency == "low" ? " (Low Urgency) " : "") + '</b><br>' + moment(d.starttime).format('llll') + ': ' + d.leSummary 
					+ '<br>' + moment(d.starttime).from(moment(d.endtime), true) + ' later: ' + d.nextSummary
					+ '<br>Service: <b>' + d.service.summary + '</b>')
				.style("left", (d3.event.pageX) + "px")
				.style("top", (d3.event.pageY - 28) + "px");
			})
		.on("mousemove", function(d) {
			tooltip
				.style("opacity", .9)
				.style("left", (d3.event.pageX) + "px")
				.style("top", (d3.event.pageY - 28) + "px");
		})
		.on("mouseout", function(d) {
			d3.select(this).attr('stroke', 'none');
			tooltip.transition()
				.duration(200)
				.style("opacity", 0);
		});


/*
	var rects = g.append('rect')
		.attr('x', function(d) { return time_scale(moment(d.log_entries[0].created_at)); } )
		.attr('y', function(d, i) { return y(i); } )
		.attr('width', function(d) { return time_scale(moment(d.log_entries[d.log_entries.length - 1].created_at)) - time_scale(moment(d.log_entries[0].created_at)); })
		.attr('height', height/incidents.length )
		.attr('color', 'steelblue')
		.style('opacity', 0.5)
		.on("mouseover", function(d) {
			console.log(d);
			tooltip.transition()
				.duration(50)
				.style("opacity", .9);
				tooltip.html(d.incident.summary)
				.style("left", (d3.event.pageX) + "px")
				.style("top", (d3.event.pageY - 28) + "px");
			})
		.on("mouseout", function(d) {
			tooltip.transition()
				.duration(200)
				.style("opacity", 0);
		});

	var circles = g.each(function(d, i) {
			d3.select(this).selectAll('rect')
				.data(d.log_entries)
				.enter().append('circle')
				.attr('r', height/incidents.length/2)
				.attr('cx', function(d) { return time_scale(moment(d.created_at)) })
				.attr('cy', function(d) { return y(i) + height/incidents.length/2; })
				.style('fill', function(d, i) { return colors[d.type]; })
				.on("mouseover", function(d) {
					tooltip.transition()
						.duration(50)
						.style("opacity", .9);
						tooltip.html(moment(d.created_at).format('llll') + ': ' + d.summary)
						.style("left", (d3.event.pageX) + "px")
						.style("top", (d3.event.pageY - 28) + "px");
					})
				.on("mouseout", function(d) {
					tooltip.transition()
						.duration(200)
						.style("opacity", 0);
				});
		});
*/
}

function main() {

	var since = moment().subtract(1, 'days');
	var until = moment();

	$('.busy').show();
	async.series([
		function(callback) {
			$('#busy-message').html('<h1>Getting subdomain...</h1>');
			$('.busy').show();
			var options = {
				limit: 1,
				success: function(data) {
					var subdomain = data.users[0].html_url.split(/[\/]+/)[1];
					$('#headline').html(`<h3>Incident timeline for ${subdomain} from ${since.format('llll')} until ${until.format('llll')}</h3>`);
					callback(null, 'yay');
				}
			}
			PDRequest(getParameterByName('token'), 'users', 'GET', options);
		},
		function(callback) {
			$('#busy-message').html('<h1>Getting incidents and log entries...</h1>');
			fetchReportData(since, until, function(data) {
				callback(null, data);
			});
		}
	],
	function(err, results) {
		var log_entries = results[1][0];
		var fetchedIncidents = results[1][1];

		var incidents = parseReportData(log_entries, fetchedIncidents);

		$('.busy').hide();
		visualize(incidents);
	});
}

$(document).ready(main);