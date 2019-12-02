globals = {
    editedAnnotationsId: undefined,
    editActiveContainer: {},
    drawAnnotations: true,
    allAnnotations: undefined,
    mousePosition: undefined,
    isSelecting: false
};


(function () {
    const API_ANNOTATIONS_BASE_URL = '/annotations/api/';
    const API_IMAGES_BASE_URL = '/images/api/';
    const FEEDBACK_DISPLAY_TIME = 3000;
    const ANNOTATE_URL = '/annotations/%s/';
    const IMAGE_SET_URL = '/images/imageset/%s/';
    const PRELOAD_BACKWARD = 2;
    const PRELOAD_FORWARD = 5;
    const STATIC_ROOT = '/static/';

    // TODO: Find a solution for url resolvings

    var gCsrfToken;
    var gHeaders;
    var gHideFeedbackTimeout;
    var gImageId;
    var gImageSetId;
    var gImageList;
    var gAnnotationType = -1;
    var gAnnotationTypes = {}
    let gAnnotationCache = {};
    let gImageSizes = {};


    var gShiftDown;

    // a threshold for editing an annotation if you select a small rectangle
    var gSelectionThreshold = 5;

    // save the current annotations of the image, so we can draw and hide the

    var tool;
    var selection;
    var viewer = OpenSeadragon({
        id: "openseadragon1",
        prefixUrl: '../../static/images/',
        showNavigator: true,
        animationTime: 0.5,
        blendTime: 0.1,
        constrainDuringPan: true,
        maxZoomPixelRatio: 2,
        //minZoomLevel: 1,
        visibilityRatio: 1,
        zoomPerScroll: 2,
        timeout: 120000,
    });
    viewer.gestureSettingsMouse.clickToZoom = false;


    viewer.selection({
        allowRotation: false,
        restrictToImage: true,
        //showConfirmDenyButtons: false
    });

    viewer.addHandler("open", function () {
        // To improve load times, ignore the lowest-resolution Deep Zoom
        // levels.  This is a hack: we can't configure the minLevel via
        // OpenSeadragon configuration options when the viewer is created
        // from DZI XML.
        //viewer.source.minLevel = 8;

        var tracker = new OpenSeadragon.MouseTracker({
            element: viewer.container,
            moveHandler: function (event) {
                globals.mousePosition = event.position;
            }
        });

        // Check if navigator overlay exists or is supported
        $.ajax(API_IMAGES_BASE_URL + 'image/navigator_overlay_status/', {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            data: {image_id: gImageId},
            success: function (data, textStatus, jqXHR) {
                // Navigator overlay exists and can be set
                if (jqXHR.status === 200) {

                    var navigator_overlay = {
                        Image: {
                            xmlns: "http://schemas.microsoft.com/deepzoom/2008",
                            Url: window.location.origin + "/images/image/" + gImageId + "_navigator_overlay/",
                            Format: "jpeg",
                            Overlap: "2",
                            TileSize: "256",
                            Size: {
                                Width: gImageSizes[gImageId]['width'],
                                Height: gImageSizes[gImageId]['height'],
                            }
                        }
                    };

                    var tiledImage = viewer.world.getItemAt(0);
                    viewer.navigator.addTiledImage({
                        tileSource: navigator_overlay,
                        originalTiledImage: tiledImage
                    });
                }
            },
            error: function () {

            }
        });
    });

    /*
       User navigation interaction on the image finished
     */
    viewer.addHandler('animation-finish', function (e) {
        updatePlugins(gImageId);
    });

    /*
       confirm selection
     */
    viewer.addHandler("selection_onDragEnd", function (event) {

        if (globals.editedAnnotationsId !== undefined) {
            var annotation = globals.allAnnotations.filter(function (d) {
                return d.id === globals.editedAnnotationsId;
            })[0];

            annotation.vector = tool.getHitAnnotationVector();
        }
    });

    viewer.addHandler('selection_onDrag', function (event) {

        if (globals.editedAnnotationsId !== undefined) {

            tool.handleMouseDrag(event);
        }
    });

    viewer.addHandler('selection_toggle', function (event) {

        if (event.enabled === false && globals.editedAnnotationsId !== undefined) {
            finishAnnotation(globals.editedAnnotationsId);
        }

    });

    function finishAnnotation(id) {

        if (id !== undefined) {

            var annotation = globals.allAnnotations.filter(function (d) {
                return d.id === id;
            })[0];

            saveAnnotationAtServer(annotation);
            tool.resetSelection();
        }
    }

    viewer.addHandler('selection_onPress', function (event) {

        // Convert pixel to viewport coordinates
        var viewportPoint = viewer.viewport.pointFromPixel(event.position);

        // Convert from viewport coordinates to image coordinates.
        var imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

        // check if the point is inside the image
        if (tool.isPointInImage(imagePoint)) {

            var id = tool.hitTest(imagePoint);

            // check if annotation was hit
            if (id !== undefined){
                // if the user jumps from one annotation to the next
                // cancel and save fist annotation
                if (globals.editedAnnotationsId !== undefined &&
                    id !== globals.editedAnnotationsId) {

                    finishAnnotation(globals.editedAnnotationsId);
                }
                tool.handleMousePress(event);

                globals.editedAnnotationsId = id;

                var annotation = globals.allAnnotations.filter(function (d) {
                    return d.id === id;
                })[0];
                enableAnnotationEditing(annotation);


            } else {

                let selected_annotation_type = undefined;

                if ($('#annotation_type_id').children().length > 0) {
                    selected_annotation_type = $('#annotation_type_id').children(':selected').data();
                    if (selected_annotation_type === undefined) {
                        displayFeedback($('#feedback_annotation_type_missing'));
                        return;
                    } else {
                        selected_annotation_type = gAnnotationTypes[$('#annotation_type_id').children(':selected').val()]
                    }
                }

                if (globals.editedAnnotationsId === undefined) {

                    // create new anno
                    var newAnno = tool.initNewAnnotation(event, selected_annotation_type);
                    globals.allAnnotations.push(newAnno);
                    enableAnnotationEditing(newAnno);

                } else if (globals.editedAnnotationsId !== undefined &&
                    id === undefined) {

                    finishAnnotation(globals.editedAnnotationsId);

                    // create new anno
                    var newAnno = tool.initNewAnnotation(event, selected_annotation_type);
                    globals.allAnnotations.push(newAnno);
                    enableAnnotationEditing(newAnno);
                }
            }
        }
    });

    /*
       cancel selection
     */
    viewer.addHandler("selection_cancel", function (data) {
        //viewer.selectionInstance.cancel();
        tool.resetSelection();
    });

    viewer.guides({
        allowRotation: false,        // Make it possible to rotate the guidelines (by double clicking them)
        horizontalGuideButton: null, // Element for horizontal guideline button
        verticalGuideButton: null,   // Element for vertical guideline button
        prefixUrl: '../../static/images/',
        removeOnClose: true,        // Remove guidelines when viewer closes
        useSessionStorage: false,    // Save guidelines in sessionStorage
        navImages: {
            guideHorizontal: {
                REST: 'guidehorizontal_rest.png',
                GROUP: 'guidehorizontal_grouphover.png',
                HOVER: 'guidehorizontal_hover.png',
                DOWN: 'guidehorizontal_pressed.png'
            },
            guideVertical: {
                REST: 'guidevertical_rest.png',
                GROUP: 'guidevertical_grouphover.png',
                HOVER: 'guidevertical_hover.png',
                DOWN: 'guidevertical_pressed.png'
            }
        }
    });




    function shorten(string, length) {
        let threshold = length || 30;
        if (string.length < threshold) {
            return string;
        } else {
            return string.substr(0, threshold / 2 - 1) + '...' + string.substr(-threshold / 2 + 2, threshold / 2 - 2);
        }
    }

    function initTool() {
        setTool();
        loadAnnotateView(gImageId);
    }

    function setTool() {

        if (tool && tool.getImageId() === gImageId) {
            // Tool does not have to change
            return;
        }

        if (tool) {
            tool.clear();
            delete tool;
        }

        tool = new BoundingBoxes(viewer, gImageId, gImageSizes[gImageId]);
        tool.strokeWidth = document.getElementById("StrokeWidthSlider").value;


        if (globals.allAnnotations) {
            tool.drawExistingAnnotations(globals.allAnnotations);
        }
        console.log("Created tool for " + tool.getImageId());
    }


    /**
     * Create an annotation using the form data from the current page.
     * If an annotation is currently edited, an update is triggered instead.
     *
     * @param event
     * @param successCallback a function to be executed on success
     * @param markForRestore
     */
    function saveAnnotationAtServer(annotation) {

        var annotationTypeId = parseInt($('#annotation_type_id').val());
        if (annotationTypeId == -1 || isNaN(annotationTypeId || annotation === undefined)) {
            displayFeedback($('#feedback_annotation_type_missing'));
            return;
        }

        if (annotationTypeId !== annotation.annotation_type.id) {
            tool.updateAnnotationType(globals.editedAnnotationsId, gAnnotationTypes[annotationTypeId]);
        }

        var action = 'create';
        var editing = false;
        var data = {
            annotation_type_id: annotationTypeId,
            image_id: gImageId,
            vector: annotation.vector
        };
        if ((typeof globals.editedAnnotationsId === 'string') &&
            globals.editedAnnotationsId.startsWith('~'))
        {
            data.tempid = globals.editedAnnotationsId
        } else if (globals.editedAnnotationsId !== undefined) {
            // edit instead of create
            action = 'update';
            data.annotation_id = globals.editedAnnotationsId;
            editing = true;
        }

        $('.js_feedback').stop().addClass('hidden');
        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/' + action + '/', {
            type: 'POST',
            headers: gHeaders,
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (data, textStatus, jqXHR) {
                if (jqXHR.status === 200) {
                    if (editing) {
                        displayFeedback($('#feedback_annotation_updated'));
                    } else {
                        displayFeedback($('#feedback_annotation_exists'));
                    }
                } else if (jqXHR.status === 201) {
                    displayFeedback($('#feedback_annotation_created'));
                }

                // update current annotations
                var index = globals.allAnnotations.findIndex((elem) => elem.id === data.annotations.id);
                if (index === -1) {
                    if (data.tempid !== false) {
                        index = globals.allAnnotations.findIndex((elem) => elem.id === data.tempid);
                        tool.updateName(data.tempid, data.annotations.id);
                        globals.allAnnotations[index] = data.annotations;
                    }
                    globals.allAnnotations.push(data.annotations)
                } else {
                    globals.allAnnotations[index] = data.annotations;
                }

                gAnnotationCache[gImageId] = globals.allAnnotations;

                loadStatistics(gImageId);
            },
            error: function () {
                displayFeedback($('#feedback_connection_error'));
            }
        });
    }

    function loadAnnotationTypeList(imageSetId) {
        let params = {
            imageset_id: imageSetId
        };

        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/loadannotationtypes/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data) {
                data.annotation_types.forEach(x => gAnnotationTypes[x.id] = x);
                displayAnnotationTypeOptions(data.annotation_types);
            },
            error: function () {
                displayFeedback($('#feedback_connection_error'))
            }
        })
    }

    function displayAnnotationTypeOptions(annotationTypeList) {
        // TODO: empty the options?
        let annotationTypeFilterSelect = $('#filter_annotation_type');
        let annotationTypeToolSelect = $('#annotation_type_id');

        $.each(annotationTypeList, function (key, annotationType) {


            annotationTypeToolSelect.append($('<option/>', {
                name: annotationType.name,
                value: annotationType.id,
                style: "background-color: " + annotationType.color_code,
                html: annotationType.name + ' (' + (key) + ')',
                id: 'annotation_type_' + (key),
                'data-vector-type': annotationType.vector_type,
                'data-node-count': annotationType.node_count,
                'data-blurred': annotationType.enable_blurred,
                'data-default_width': annotationType.default_width,
                'data-default_height': annotationType.default_height,
                'data-concealed': annotationType.enable_concealed,
                'data-background-color': annotationType.color_code
            }));

            annotationTypeFilterSelect.append($('<option/>', {
                name: annotationType.name,
                value: annotationType.id,
                html: annotationType.name
            }));
        });
    }

    /**
     * Delete an annotation.
     *
     * @param event
     * @param annotationId
     */
    function deleteAnnotation(event, annotationId) {

        if (event !== undefined) {
            // TODO: Do not use a primitive js confirm
            if (!confirm('Do you really want to delete the annotation?')) {
                return;
            }
        }

        tool.removeAnnotation(annotationId);
        //  if annotation was not send to server stop now
        if (typeof annotationId === 'string') {
            globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                return value.id !== annotationId;
            });
            gAnnotationCache[gImageId] = globals.allAnnotations;
            displayFeedback($('#feedback_annotation_deleted'));
            globals.editedAnnotationsId = undefined;
            tool.resetSelection();
        } else {
            $('.js_feedback').stop().addClass('hidden');
            var params = {
                annotation_id: annotationId
            };
            $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/delete/?' + $.param(params), {
                type: 'DELETE',
                headers: gHeaders,
                dataType: 'json',
                success: function (data) {

                    globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                        return value.id !== data.annotations.id;
                    });
                    gAnnotationCache[gImageId] = globals.allAnnotations;
                    displayFeedback($('#feedback_annotation_deleted'));
                    globals.editedAnnotationsId = undefined;

                    tool.resetSelection();
                    loadStatistics(gImageId);
                },
                error: function () {
                    displayFeedback($('#feedback_connection_error'));
                }
            });
        }
    }

    /**
     * Highlight one annotation in a different color
     * @param annotationTypeId
     * @param annotationId
     */

    function handleMouseClick(e) {


    }

    /**
     * Display an image from the image cache or the server.
     *
     * @param imageId
     */
    function displayImage(imageId) {
        imageId = parseInt(imageId);

        if (gImageList.indexOf(imageId) === -1) {
            console.log(
                'skiping request to load image ' + imageId +
                ' as it is not in current image list.');
            return;
        }

        gImageId = imageId;
        preloadAnnotations(imageId, gImageList);

        viewer.open({tileSource: window.location.origin + "/images/image/" + imageId});
    }

    /**
     * Display the images of an image list.
     *
     * @param imageList
     */
    function displayImageList(imageList) {
        var oldImageList = $('#image_list');
        var result = $('<div>');
        var imageContained = false;

        oldImageList.html('');

        for (var i = 0; i < imageList.length; i++) {
            var image = imageList[i];

            var link = $('<a>');
            link.attr('id', 'annotate_image_link_' + image.id);
            link.attr('href', ANNOTATE_URL.replace('%s', image.id));
            link.addClass('annotate_image_link');
            if (image.id === gImageId) {
                link.addClass('active');
                imageContained = true;
            }
            link.text(image.name);
            link.data('imageid', image.id);
            link.click(function (event) {
                event.preventDefault();
                loadAnnotateView($(this).data('imageid'));
            });

            result.append(link);
        }

        oldImageList.attr('id', '');
        result.attr('id', 'image_list');
        oldImageList.replaceWith(result);

        gImageList = getImageList();

        // load first image if current image is not within image set
        if (!imageContained) {
            loadAnnotateView(imageList[0].id);
        }

        scrollImageList();
    }

    /**
     * Display a feedback element for a few seconds.
     *
     * @param elem
     */
    function displayFeedback(elem) {
        if (gHideFeedbackTimeout !== undefined) {
            clearTimeout(gHideFeedbackTimeout);
        }

        elem.removeClass('hidden');

        gHideFeedbackTimeout = setTimeout(function () {
            $('.js_feedback').addClass('hidden');
        }, FEEDBACK_DISPLAY_TIME);
    }

    /**
     * Edit an annotation.
     *
     * @param event
     * @param annotationElem the element which stores the edit button of the annotation
     * @param annotationId
     */
    function enableAnnotationEditing(annotation) {
        //annotationElem = $(annotationElem);
        let annotationTypeId = annotation.annotation_type.id;
        $('#annotation_type_id').val(annotationTypeId);
        handleAnnotationTypeChange();
        globals.editedAnnotationsId = annotation.id;
        globals.editActiveContainer.removeClass('hidden');


        $('.js_feedback').stop().addClass('hidden');

        // highlight currently edited annotation
        $('.annotation').removeClass('alert-info');

        $('#annotation_type_id').val(annotationTypeId);
        $('#annotation_buttons').show();
        $('.annotate_button').prop('disabled', false);
    }

    /**
     * Get the image list from all .annotate_image_link within #image_list.
     */
    function getImageList() {
        var imageList = [];
        $('#image_list').find('.annotate_image_link').each(function (key, elem) {
            var imageId = parseInt($(elem).data('imageid'));
            if (imageList.indexOf(imageId) === -1) {
                imageList.push(imageId);
            }
        });

        return imageList;
    }

    /**
     * Handle toggle of the not in image checkbox.
     *
     * @param event
     */
    function handleNotInImageToggle(event) {
        let coordinate_table = $('#coordinate_table');

        if ($('#not_in_image').is(':checked')) {
            coordinate_table.hide();
        } else {
            coordinate_table.show();
        }
    }

    /**
     * Handle toggle of the draw annotations checkbox.
     *
     * @param event
     */
    function handleShowAnnotationsToggle(event) {
        globals.drawAnnotations = $('#draw_annotations').is(':checked');
        if (globals.drawAnnotations) {
            tool.drawExistingAnnotations(globals.allAnnotations);
        } else {
            tool.clear();
        }
    }

    /**
     * Handle a selection using the mouse.
     *
     * @param event
     */
    function handleSelection(event) {
    }

    function updatePlugins(imageId) {

        var bounds = viewer.viewport.getBounds(true);
        var imageRect = viewer.viewport.viewportToImageRectangle(bounds);

        let data = {
            image_id: imageId,
            options: {
                min_x:  Math.round(imageRect.x),
                min_y:  Math.round(imageRect.y),
                max_x:  Math.round(imageRect.x + imageRect.width),
                max_y:  Math.round(imageRect.y + imageRect.height)
            }

        };

        // update Plugins
        $.ajax(API_IMAGES_BASE_URL + 'image/plugins/', {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            data: {'values': JSON.stringify(data)},
            success: function (data) {
                var el = document.getElementById('statistics_tabs');

                for (plugin of data.plugins) {
                    var tab_name = plugin.id;

                    if (document.getElementById(tab_name + "_tab") === null){

                        var node = document.createElement("li");
                        node.setAttribute('class', 'nav-item');

                        var tab_name = plugin.id;
                        var link = document.createElement("a");
                        link.setAttribute('class', 'nav-link');
                        link.setAttribute('id', tab_name + "_tab");
                        link.setAttribute('data-toggle', 'tab');
                        link.setAttribute('href', '#' + tab_name);
                        link.textContent = tab_name;

                        node.appendChild(link);
                        el.appendChild(node);
                    }
                }

                var el_content = document.getElementById('statistics_tabs_content');

                for (plugin of data.plugins) {
                    var tab_name = plugin.id;

                    var node = document.getElementById(tab_name);
                    if (node === null) {
                        var node = document.createElement("div");
                        node.setAttribute('class', 'tab-pane fade');
                        node.setAttribute('id', tab_name);

                        node.innerHTML = plugin.content;
                        el_content.appendChild(node);
                    } else {
                        node.innerHTML = plugin.content;
                    }
                }
            },
            error: function () {
            }
        });

    }

    function loadStatistics(imageId) {
        let data = {
            image_id: imageId
        };

        // update statistics
        $.ajax(API_IMAGES_BASE_URL + 'image/statistics/', {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            data: data,
            success: function (data) {
                for (anno_type of data.statistics) {
                    document.getElementById(anno_type.name + '_' + anno_type.id).innerHTML =
                        anno_type.count + ' / ' + anno_type.verified_count;
                }
            },
            error: function () {

            }
        });

        updatePlugins(imageId);
    }

    /**
     * Load the annotation view for another image.
     *
     * @param imageId
     * @param fromHistory
     */
    function loadAnnotateView(imageId, fromHistory) {
        globals.editedAnnotationsId = undefined;

        imageId = parseInt(imageId);

        if (gImageList.indexOf(imageId) === -1) {
            console.log(
                'skiping request to load image ' + imageId +
                ' as it is not in current image list.');
            return;
        }

        var noAnnotations = $('#no_annotations');
        var notInImage = $('#not_in_image');
        var existingAnnotations = $('#existing_annotations');
        var loading = $('#annotations_loading');
        existingAnnotations.addClass('hidden');
        noAnnotations.addClass('hidden');
        notInImage.prop('checked', false).change();
        loading.removeClass('hidden');
        $('#annotation_type_id').val(gAnnotationType);

        loadStatistics(imageId);
        displayImage(imageId);

        $('#coordinate_table').hide();
        $('#annotation_buttons').hide();

        if (!$('#keep_selection').prop('checked')) {
            $('#concealed').prop('checked', false);
            $('#blurred').prop('checked', false);
        }
        scrollImageList();

        $('.annotate_image_link').removeClass('active');
        var link = $('#annotate_image_link_' + imageId);
        link.addClass('active');
        $('#active_image_name').text(link.text().trim());
        let next_image_id = gImageList[gImageList.indexOf(imageId) + 1];
        if (gImageList.length !== 1 && next_image_id === undefined) {
            next_image_id = gImageList[0];
        }
        $('#next-image-id').attr('value', next_image_id || '');

        if (fromHistory !== true) {
            history.pushState({
                imageId: imageId
            }, document.title, '/annotations/' + imageId + '/');
        }

        let handleNewAnnotations = function () {
            // image is in cache.
            globals.allAnnotations = gAnnotationCache[imageId];
            setTool();
            loading.addClass('hidden');
            tool.drawExistingAnnotations(globals.allAnnotations);
        };

        // load existing annotations for this image
        if (gAnnotationCache[imageId] === undefined) {
            // image is not available in cache. Load it.
            loadAnnotationsToCache(imageId);
            $(document).one("ajaxStop", handleNewAnnotations);
        } else if ($.isEmptyObject(gAnnotationCache[imageId])) {
            // we are already loading the annotation, wait for ajax
            $(document).one("ajaxStop", handleNewAnnotations);
        } else {
            handleNewAnnotations();
        }

        loadImageList();
    }

    /**
     * Load the image list from tye server applying a new filter.
     */
    function loadImageList() {
        let filterElem = $('#filter_annotation_type');
        let filter = filterElem.val();
        let params = {
            image_set_id: gImageSetId,
            filter_annotation_type_id: filter
        };

        // select the corresponding annotation type for the label tool
        if (filter !== '' && !isNaN(filter)) {
            params.filter_annotation_type_id = filter;
            $('#annotation_type_id').val(filter);
            handleAnnotationTypeChange();
        }

        $.ajax(API_IMAGES_BASE_URL + 'imageset/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {
                if (data.image_set.images.length === 0) {
                    // redirect to image set view.
                    displayFeedback($('#feedback_image_set_empty'));
                    filterElem.val('').change();
                    return;
                }
                displayImageList(data.image_set.images);
            },
            error: function () {
                displayFeedback($('#feedback_connection_error'));
            }
        });
    }

    /**
     * Load the annotations of an image to the cache if they are not in it already.
     *
     * @param imageId
     */
    function loadAnnotationsToCache(imageId) {
        imageId = parseInt(imageId);

        if (gImageList.indexOf(imageId) === -1) {
            console.log(
                'skiping request to load annotations of image ' + imageId +
                ' as it is not in current image list.');
            return;
        }

        if (gAnnotationCache[imageId] !== undefined) {
            // already cached
            return;
        }
        // prevent multiple ajax requests for the same image
        gAnnotationCache[imageId] = {};

        var params = {
            image_id: imageId
        };
        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data) {
                // save the current annotations to the cache
                gAnnotationCache[imageId] = data.annotations;
                console.log("Chaching annotations for", imageId);
            },
            error: function () {
                console.log("Unable to load annotations for image" + imageId);
            }
        });
    }

    /**
     * Load the previous or the next image
     *
     * @param offset integer to add to the current image index
     */
    function loadAdjacentImage(offset) {
        var imageIndex = gImageList.indexOf(gImageId);
        if (imageIndex < 0) {
            console.log('current image is not referenced from page!');
            return;
        }

        imageIndex += offset;
        while (imageIndex < 0) {
            imageIndex += imageIndex.length;
        }
        while (imageIndex > imageIndex.length) {
            imageIndex -= imageIndex.length;
        }

        loadAnnotateView(gImageList[imageIndex]);
    }

    /**
     * Delete all images from cache except for those in Array keep
     *
     * @param keep Array of the image ids which should be kept in the cache.
     */
    function pruneAnnotationCache(keep) {
        for (var imageId in gAnnotationCache) {
            imageId = parseInt(imageId);
            if (gAnnotationCache[imageId] !== undefined && keep.indexOf(imageId) === -1) {
                delete gAnnotationCache[imageId];
            }
        }
    }

    /**
     * TODO: Intelligenter machen mit Bildern aus SET!!!
     * Preload next and previous annotations to cache.
     */
    function preloadAnnotations(imageId, imageIds) {
        var keepAnnotations = [];

        var currentIndex = imageIds.indexOf(imageId);
        var startIndex = Math.max(currentIndex - PRELOAD_BACKWARD, 0);
        var endIndex = Math.min(currentIndex + PRELOAD_FORWARD, imageIds.length);
        for (var i = startIndex; i < endIndex; i++){
            keepAnnotations.push(imageIds[i]);
            loadAnnotationsToCache(imageIds[i]);
        }
        pruneAnnotationCache(keepAnnotations);
    }

    /**
     * Scroll image list to make current image visible.
     */
    function scrollImageList() {
        var imageLink = $('#annotate_image_link_' + gImageId);
        var list = $('#image_list');

        var offset = list.offset().top;
        var linkTop = imageLink.offset().top;

        // link should be (roughly) in the middle of the element
        offset += parseInt(list.height() / 2);

        list.scrollTop(list.scrollTop() + linkTop - offset);
    }

    /**
     * Handle the selection change of the annotation type.
     * Check if annotation type change is valid
     */

    function handleAnnotationTypeChange() {

        if (viewer.selectionInstance.isSelecting
            && globals.editedAnnotationsId !== undefined) {

            var newType = gAnnotationTypes[$('#annotation_type_id').children(':selected').val()]

            var annotation = globals.allAnnotations.filter(function (d) {
                return d.id === globals.editedAnnotationsId;
            })[0];

            // check if annotation type needs to be changed
            if (annotation.annotation_type.id !==  newType.id) {
                // check if annotation type can be converted and save
                if(tool.checkIfAnnotationTypeChangeIsValid(annotation.annotation_type.vector_type,
                    newType.vector_type)) {
                    saveAnnotationAtServer(annotation)
                } else { // reset annotation type on gui
                    displayFeedback($('#feedback_annotation_type_can_not_be_set'));

                    var annotationTypeId = '#annotation_type_' + annotation.annotation_type.id;
                    var option = $(annotationTypeId);
                    if (option.length) {
                        $('#annotation_type_id').val(option.val());
                    }
                }
            }
        }
    }

    function handleMouseDown(event) {

        if (!$('#draw_annotations').is(':checked'))
            return;

        if (parseInt($('#annotation_type_id').val()) === -1) {
            displayFeedback($('#feedback_annotation_type_missing'));
            return;
        }

        tool.handleMouseDown(event);
    }

    function handleMouseUp(event) {
        return;
        if (!$('#draw_annotations').is(':checked'))
            return;

        tool.handleMouseUp(event);
    }

    // handle DEL key press
    function handleDelete(event) {
        if (globals.editedAnnotationsId === undefined)
            return;

        deleteAnnotation(event, globals.editedAnnotationsId);
    }

    function selectAnnotationType(annotationTypeNumber) {
        if (typeof annotationTypeNumber == "undefined")
            return

        var annotationTypeId = '#annotation_type_' + annotationTypeNumber;
        var option = $(annotationTypeId);
        if (option.length) {
            $('#annotation_type_id').val(option.val());
        }
        handleAnnotationTypeChange();
    }

    function handleResize() {
        var image_node = document.getElementById('openseadragon1');
        var footer_node  = document.getElementById('footer_id');

        var image_rect = image_node.getBoundingClientRect();
        if (footer_node !== null) {
            var footer_rect = footer_node.getBoundingClientRect();

            var height = window.innerHeight - (3 * footer_rect.height); //footer_rect.y - image_rect.y;
            var width = footer_rect.right - 45 - image_rect.left;

            image_node.style.height = height+ 'px';
            image_node.style.width = width+ 'px';

        }
    }


    $(function () {
        let get_params = decodeURIComponent(window.location.search.substring(1)).split('&');
        let editAnnotationId = undefined;
        for (let i = 0; i < get_params.length; i++) {
            let parameter = get_params[i].split('=');
            if (parameter[0] === "edit") {
                editAnnotationId = parameter[1];
                break;
            }
        }
        globals.editActiveContainer = $('#edit_active');
        globals.drawAnnotations = $('#draw_annotations').is(':checked');

        // get current environment
        gCsrfToken = $('[name="csrfmiddlewaretoken"]').first().val();
        gImageId = parseInt($('#image_id').html());
        gImageSetId = parseInt($('#image_set_id').html());
        gHeaders = {
            "Content-Type": 'application/json',
            "X-CSRFTOKEN": gCsrfToken
        };
        gImageList = getImageList();
        preloadAnnotations(gImageId, gImageList);
        loadAnnotationTypeList(gImageSetId);
        scrollImageList();


        params = {image_set_id: gImageSetId};
        $.ajax(API_IMAGES_BASE_URL + 'imageset/load/?' + $.param(params), {
            type: 'GET',
            headers: gHeaders,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {
                data.image_set.images.forEach(x => gImageSizes[x.id] = {"width":x.width, "height": x.height });

                initTool();
            },
            error: function () {
            }
        });

        // W3C standards do not define the load event on images, we therefore need to use
        // it from window (this should wait for all external sources including images)
        $(window).on('load', function () {
            handleResize();
        }());

        $('.annotation_value').on('input', function () {

        });
        $('#not_in_image').on('change', handleNotInImageToggle);
        handleNotInImageToggle();
        $('select#filter_annotation_type').on('change', loadImageList);
        $('#filter_update_btn').on('click', loadImageList);
        $('select').on('change', function () {
            document.activeElement.blur();
        });
        $('#draw_annotations').on('change', handleShowAnnotationsToggle);
        $('select#annotation_type_id').on('change', handleAnnotationTypeChange);

        // register click events
        $(window).click(function (e) {
            handleMouseClick(e);
        });
        $('#cancel_edit_button').click(function () {
            tool.resetSelection();
        });
        $('#delete_annotation_button').click(function () {
            deleteAnnotation(undefined, globals.editedAnnotationsId);
        });
        $('#verify_annotation_button').click(function () {
            let data_val = {
                annotation_id: globals.editedAnnotationsId,
                state: 'accept',
            };

            // update current annotations
            $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/verify/', {
                type: 'POST',
                headers: gHeaders,
                dataType: 'json',
                data: JSON.stringify(data_val),
                success: function (data) {
                    displayFeedback($('#feedback_verify_successful'));
                    loadImageList();
                },
                error: function () {
                    displayFeedback($('#feedback_connection_error'));
                }
            })
        });
        $('#save_button').click(function () {
            finishAnnotation(globals.editedAnnotationsId);
        });
        $('#reset_button').click(function () {
            tool.resetSelection();
        });
        $('#last_button').click(function (event) {
            event.preventDefault();
            loadAdjacentImage(-1);
        });
        $('#back_button').click(function (event) {
            event.preventDefault();
            loadAdjacentImage(-1);
        });
        $('#skip_button').click(function (event) {
            event.preventDefault();
            loadAdjacentImage(1);
        });
        $('#next_button').click(function (event) {
            event.preventDefault();

            if (globals.allAnnotations.length == 0) {

                var annotationTypeId = parseInt($('#annotation_type_id').val());
                var action = 'create';
                var data = {
                    annotation_type_id: annotationTypeId,
                    image_id: gImageId,
                    vector: null,
                    concealed: false,
                    blurred: false
                };

                $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/' + action + '/', {
                    type: 'POST',
                    headers: gHeaders,
                    dataType: 'json',
                    data: JSON.stringify(data),
                    success: function (data) {
                        displayFeedback($('#feedback_verify_successful'));

                        let data_val = {
                            annotation_id: data.annotations["0"].id,
                            state: 'accept',
                        };

                        // update current annotations
                        $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/verify/', {
                            type: 'POST',
                            headers: gHeaders,
                            dataType: 'json',
                            data: JSON.stringify(data_val),
                            success: function (data) {
                                displayFeedback($('#feedback_verify_successful'));
                                loadImageList();
                            },
                            error: function () {
                                displayFeedback($('#feedback_connection_error'));
                            }
                        })
                    },
                    error: function () {
                        displayFeedback($('#feedback_connection_error'));
                    }
                })
            }

            for (i = 0; i < globals.allAnnotations.length; i++) {
                let anno = globals.allAnnotations[i];

                let data = {
                    annotation_id: anno.id,
                    state: 'accept',
                };

                $.ajax(API_ANNOTATIONS_BASE_URL + 'annotation/verify/', {
                    type: 'POST',
                    headers: gHeaders,
                    dataType: 'json',
                    data: JSON.stringify(data),
                    success: function (data) {
                        displayFeedback($('#feedback_verify_successful'));
                    },
                    error: function () {
                        displayFeedback($('#feedback_connection_error'));
                    }
                })
            }

            loadImageList();
            loadAdjacentImage(1);
        });
        $('.js_feedback').mouseover(function () {
            $(this).addClass('hidden');
        });
        document.getElementById("StrokeWidthSlider").oninput = function(event) {
            tool.updateStrokeWidth(event.srcElement.valueAsNumber);
        };

        $(document).on('mousemove touchmove', handleSelection);
        $(window).on('resize', handleResize);

        window.onpopstate = function (event) {
            if (event.state !== undefined && event.state !== null && event.state.imageId !== undefined) {
                loadAnnotateView(event.state.imageId, true);
            }
        };

        // attach listeners for mouse events
        $(document).on('mousedown.annotation_edit', handleMouseDown);
        // we have to bind the mouse up event globally to also catch mouseup on small selections
        $(document).on('mouseup.annotation_edit', handleMouseUp);

        $(document).keydown(function (event) {
            switch (event.keyCode) {
                case 16: // Shift
                    gShiftDown = true;
                    break;
                case 27: // Escape
                    // delete temp annotation
                    if (typeof globals.editedAnnotationsId === 'string') {
                        tool.removeAnnotation(globals.editedAnnotationsId);

                        globals.allAnnotations = globals.allAnnotations.filter(function (value, index, arr) {
                            return value.id !== globals.editedAnnotationsId;
                        });
                        gAnnotationCache[gImageId] = globals.allAnnotations;
                    }

                    tool.handleEscape();
                    break;
                case 73: //i
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 75: //k
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 76: //l
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 74: //j
                    if (gShiftDown) {
                        break;
                    }
                    break;
                case 48: //0
                    selectAnnotationType(0);
                    break;
                case 49: //1
                    selectAnnotationType(1);
                    break;
                case 50: //2
                    selectAnnotationType(2);
                    break;
                case 51: //3
                    selectAnnotationType(3);
                    break;
                case 52: //4
                    selectAnnotationType(4);
                    break;
                case 53: //5
                    selectAnnotationType(5);
                    break;
                case 54: //6
                    selectAnnotationType(6);
                    break;
                case 55: //7
                    selectAnnotationType(7);
                    break;
                case 56: //8
                    selectAnnotationType(8);
                    break;
                case 57: //9
                    selectAnnotationType(9);
                    break;
                case 96: //0
                    selectAnnotationType(0);
                    break;
                case 97: //1
                    selectAnnotationType(1);
                    break;
                case 98: //2
                    selectAnnotationType(2);
                    break;
                case 99: //3
                    selectAnnotationType(3);
                    break;
                case 100: //4
                    selectAnnotationType(4);
                    break;
                case 101: //5
                    selectAnnotationType(5);
                    break;
                case 102: //6
                    selectAnnotationType(6);
                    break;
                case 103: //7
                    selectAnnotationType(7);
                    break;
                case 104: //8
                    selectAnnotationType(8);
                    break;
                case 105: //9
                    selectAnnotationType(9);
                    break;
            }
        });
        $(document).keyup(function (event) {
            switch (event.keyCode) {
                case 8: //'DEL'
                    handleDelete(event);
                    break;
                case 13: //'enter'
                    $('#save_button').click();
                    break;
                case 16: // Shift
                    break;
                case 70: //f
                    $('#next_button').click();
                    break;
                case 68: //d
                    $('#skip_button').click();
                    break;
                case 83: //s
                    $('#back_button').click();
                    break;
                case 65: //a
                    $('#last_button').click();
                    break;
                case 71: //g
                    $('#not_in_image').click();
                    break;
                case 82: //r
                    $('#reset_button').click();
                    break;
                case 86: //'v'
                    $('#save_button').click();
                    break;
                case 46: //'DEL'
                    handleDelete(event);
                    break;
                case 66: //b
                    break;
                case 67: //c
                    viewer.selectionInstance.toggleState();
                    break;
            }
        });
        $(document).one("ajaxStop", function () {
            selectAnnotationType($('#main_annotation_type_id').html());
            if (editAnnotationId) {
                $('#annotation_edit_button_' + editAnnotationId).click();
            }
        });
    });
})();
