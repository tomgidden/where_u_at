var Calendar, Clock, People;

function mqtt_message(topic, payload, details)
{
    payload = payload.toString();

    if (0 === topic.indexOf('/calendar')) {
        calendar_update(topic, payload, details);
        clock_update();
    }
    else if (0 === topic.indexOf('/location')) {
        location_update(topic, payload, details);
        clock_update();
    }
}

function map_toggle(ev)
{
    var person = $(ev.currentTarget);

    var position = {lat: person.data('latitude'), lng: person.data('longitude')};

    var parent = $('#map_parent');

    if ($('#map').length !== 0) {
        parent.fadeOut('slow', function () { $('#map').remove(); });
    }
    else {
        map = $('<div>').prop('id', 'map').appendTo(parent);

        gmap = new google.maps.Map(document.getElementById('map'), {
            zoom: 17,
            center: position,
            mapTypeId: 'terrain',
            styles: mapstyle
        });

        new google.maps.Marker({
            position: position,
            map: gmap,
            label: person.data('label')
        });

        parent.fadeIn('slow');
    }
}

function calendar_set_day(parent, date, events, title, cls)
{
    var id = date.format('YYYYMMDD');

    var day_el = $('<div>');

    var title_el = $('<heading>').addClass('title');

    day_el.prop('class', 'day');
    if (cls) day_el.addClass(cls);

    if (title) {
        title_el.text(title);
    }
    else {
        title_el.title(date.format('dddd, D mmmm'));
    }

    if (events) {

        for (var i in events) {
            if (!events.hasOwnProperty(i)) continue;
            var event = events[i];

            var event_el = $('<div>')
                .addClass('event');

            if (! event.allday ) {
                $('<div>')
                    .addClass('time format')
                    .data('time', event.begin)
                    .data('format', 'HH:mm')
                    .appendTo(event_el);
            }
            else {
                $('<div>')
                    .addClass('time allday')
                    .text('---')
                    .appendTo(event_el);
            }

            description = event.title.replace(/^\d{1,2}:\d{2}\s+/, '');

            m = description.match(/^\[(.+)\]$/);
            if (m) {
                description = m[1];
                event_el.addClass('holiday');
                event_el.prependTo(day_el);
            }
            else {
                event_el.appendTo(day_el);
            }

            $('<div>')
                .addClass('description')
                .text(description)
                .appendTo(event_el);
        }
    }
    else {
        $('<div>')
            .addClass('noevents')
            .text('No events scheduled')
            .appendTo(day_el);

        day_el.addClass('noevents');
    }

    day_el.prepend(title_el);
    parent.append(day_el);
}

function calendar_resolve(payload)
{
    var events = [];

    var now_doy = moment().dayOfYear();
    var now_year = moment().year();

    for (var i in payload) {
        if (!payload.hasOwnProperty(i)) continue;

        var event = payload[i];

        // event.begin = event.begin.replace(/([\-\+]\d\d):01$/, '$1:00');
        event.begin = moment(event.begin);
        event.end = moment(event.end);

        var days = event.begin.dayOfYear() - now_doy;
        var year = event.begin.year();

        if (year > now_year) {
            days.add(year-now_year, 'years');
        }

        if (undefined === events[days]) {
            events[days] = [ event ];
        } else {
            events[days].push(event);
        }
    }

    return events;
}

function calendar_update(topic, payload, details)
{
    payload = JSON.parse(payload);

    var days = calendar_resolve(payload);

    var nparent = $('<div>').addClass('events');

    calendar_set_day(nparent,
                     moment(),
                     undefined !== days[0] ? days[0] : null,
                     moment().format('dddd, D MMMM YYYY'),
                     'today');

    calendar_set_day(nparent,
                     moment().add(1, 'days'),
                     undefined !== days[1] ? days[1] : null,
                     'Tomorrow',
                     'tomorrow');

    for (var d in days) {
        if (!days.hasOwnProperty(d)) continue;
        if (d < 2) continue;

        var events = days[d];

        calendar_set_day(nparent,
                         events[0].begin,
                         events,
                         events[0].begin.format('ddd, D MMMM'));
    }

    Calendar
        .remove('.events')
        .append(nparent);
}

function clock_update()
{
    $('.time.since').each(function (ix, el) {
        el = $(el);
        var t = moment.duration(moment(el.data('time')) - moment.now());
        el.text( t.humanize(true) );
    });

    $('.time.format').each(function (ix, el) {
        el = $(el);
        var t = moment.duration(moment(el.data('time')) - moment.now());
        el.text( moment(el.data('time')).format(el.data('format')) );
    });

    Clock.text(moment().format('h:mm a'));
}

function location_update(topic, payload, details)
{
    payload = JSON.parse(payload);

    payload.distance = distance_from_home(payload.latitude, payload.longitude);

    //payload.since = moment(payload.time).format('ddd, h:MM a');
    //payload.since = "Since: "+moment.duration(moment(payload.time)-moment.now()).humanize(true);

    payload.address = payload.address.replace(/([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})/, '$1\xa0$2');

    if (! (person = $('#'+payload.id, People) ).length ) {
        person = $('<div>').addClass('person').prop('id', payload.id).appendTo(People);
        person.on('click', map_toggle);
    }

    if (! (nickname = $('.nickname', person) ).length )
        nickname = $('<heading>').addClass('nickname').appendTo(person);
    nickname.text(payload.nickname);

    if (! (address = $('.location', person) ).length )
        address = $('<div>').addClass('address').appendTo(person);

    if (payload.address)
        address.text(payload.address);
    else if (payload.raw_address)
        address.text(payload.raw_address);
    else
        address.text(latlon_to_dms(payload.latitude, payload.longitude))

    if (! (distance = $('.distance', person) ).length )
        distance = $('<div>').addClass('distance').appendTo(person);

    if (payload.address === 'Home') {
        distance.text('HOME');
        person.addClass('athome');
    } else {
        distance.text(payload.distance);
        person.removeClass('athome');
    }

    if (! (accuracy = $('.accuracy', person) ).length )
        accuracy = $('<div>').addClass('accuracy').appendTo(person);
    accuracy.text('± ' + payload.accuracy + 'm');

    person.data('latitude', payload.latitude);
    person.data('longitude', payload.longitude);
    person.data('label', payload.nickname.substr(0,1));



    if (! (since = $('.since', person) ).length )
        since = $('<div>').addClass('time since').appendTo(person);

    since.data('time', payload.time);
}

function precisionRound(number, precision) {
    var factor = Math.pow(10, precision);
    return Math.round(number * factor) / factor;
}

function distance_from_home(lat, lon)
{
    hlat = 51.4903304;
    hlon = -2.7640536;
    theta = hlon - lon;
    dist = Math.sin(lat*3.1415927/180.0) * Math.sin(hlat*3.1415927/180.0) + Math.cos(lat*3.1415927/180.0) * Math.cos(hlat*3.1415927/180.0) * Math.cos(theta*3.1415927/180.0);
    dist = Math.acos(dist);
    dist = dist*180.0/3.1415927;
    metres = dist * 60 *  1853;
    miles = metres * 0.000621371;

    //if (miles <= 0.1)
    //  return "here";
    //if (metres < 804)
    //  return Math.round(metres) + " metres";
    if (miles < 0.1)
        return "HOME";
    else if (miles < 100)
        return precisionRound(miles, 1) + " mi";
    else
        return Math.round(miles+0.5) + " mi";
}

function latlon_to_dms(lat, lon)
{
    if (undefined===lat || undefined===lon)
        return "";

    lad = 'N';
    if (lat < 0) {
        lad = 'S';
        lat = -lat;
    }

    lai = Math.trunc(lat);
    laf = Math.abs(lat - lai);
    tmp = laf * 3600;
    lam = Math.trunc(tmp/60);
    las = tmp - lam*60;

    lod = 'E';
    if (lon < 0) {
        lod = 'W';
        lon = -lon;
    }

    loi = Math.trunc(lon);
    lof = Math.abs(lon - loi);

    tmp = lof * 3600;
    lom = Math.trunc(tmp/60);
    los = tmp - lom*60;

    return (
        lai + "° " + lam + "' " + precisionRound(las,2) + '" ' + lad + ', ' +
            loi + "° " + lom + "' " + precisionRound(los,2) + '" ' + lod
    );
}

$(function () {

    Clock = $('#clock');
    Calendar = $('#calendar');
    People = $('#people');

    clock_update();
    setInterval(clock_update, 10000);

    var client = mqtt.connect('ws://mqtt.home:1884/');

    client
        .on('message', mqtt_message)
        .subscribe('/calendar/all_events')
        .subscribe('/location/+');
});