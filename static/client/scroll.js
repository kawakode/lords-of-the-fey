/**
    Copyright 2014 Andrew P. Sillers

    This file is part of Lords of the Fey.

    Lords of the Fey is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Lords of the Fey is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with Lords of the Fey.  If not, see <http://www.gnu.org/licenses/>.
*/
var scroll = {
    scrollX: 0,
    scrollY: 0,
    scrollInterval: null,
    scrollPeriod: 50,
    scrollDist: 50,
    scrollFunc: function() {
        scroll.applyScroll(scroll.scrollX, scroll.scrollY);
        if(scroll.scrollX == 0 && scroll.scrollY == 0) {
            clearInterval(scroll.scrollInterval); scroll.scrollInterval = null;
        }
    },
    applyScroll: function(dx,dy) {
        this.scrollTo(world.mapContainer.x - dx, world.mapContainer.y - dy);                 
    },
    scrollTo: function(x, y) {
        if(world.stage.children.indexOf(ui.contextMenu) != -1) { return; }

        var stage = world.stage;

        var mapWidth = world.mapWidth;
        var mapHeight = world.mapHeight;

        world.mapContainer.x = Math.round(Math.min(0, Math.max(x, stage.canvas.width - mapWidth)));
        world.mapContainer.y = Math.round(Math.max(Math.min(y, 0), stage.canvas.height - mapHeight));
        world.stage.update();

        minimap.positionViewBox();
    },
    addScroll: function() {
        window.addEventListener("keydown", function(e) {
            if(e.keyCode==38) { scroll.scrollY = -scroll.scrollDist; }
            if(e.keyCode==40) { scroll.scrollY = scroll.scrollDist; }
            if(e.keyCode==37) { scroll.scrollX = -scroll.scrollDist; }
            if(e.keyCode==39) { scroll.scrollX = scroll.scrollDist; }
            if(!scroll.scrollInterval) { scroll.scrollInterval = setInterval(scroll.scrollFunc, scroll.scrollPeriod); }
        });

        window.addEventListener("keyup", function(e) {
            if(e.keyCode==38) { scroll.scrollY = 0; }
            if(e.keyCode==40) { scroll.scrollY = 0; }
            if(e.keyCode==37) { scroll.scrollX = 0; }
            if(e.keyCode==39) { scroll.scrollX = 0; }
        });
    }
}

$("html, body").css("margin", 0)

/*
$(window).resize(function(e) {
    world.stage.canvas.width = $(window).width();
    world.stage.canvas.height = $(window).height();
    world.stage.update();
});
*/
