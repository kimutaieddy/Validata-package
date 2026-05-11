window.onUserActivity = function (callback) {
    document.addEventListener("click", function () {
        callback.invokeMethodAsync("OnUserActivity", "click");
    });
    // document.addEventListener("mousemove", function () {
    //     callback.invokeMethodAsync("OnUserActivity", "mousemove");
    // });
    document.addEventListener("keypress", function () {
        callback.invokeMethodAsync("OnUserActivity", "keypress");
    });
    document.addEventListener("touchstart", function () {
        callback.invokeMethodAsync("OnUserActivity", "touchstart");
    });

    document.addEventListener("scroll", function () {
        callback.invokeMethodAsync("OnUserActivity", "scroll");
    }
    );

    document.addEventListener("wheel", function () {
        callback.invokeMethodAsync("OnUserActivity", "wheel");
    }
    );

    document.addEventListener("resize", function () {
        callback.invokeMethodAsync("OnUserActivity", "resize");
    }
    );

    document.addEventListener("focus", function () {
        callback.invokeMethodAsync("OnUserActivity", "focus");
    }
    );


}
window.uploadFile = function (fileNames, url, jwtAuthToken,tenant, template, callback) {

    const hiddenFileInput = document.getElementById('fileInput');

    for (let i = 0; i < hiddenFileInput.files.length; i++) {
        if(fileNames.includes(hiddenFileInput.files[i].name) === false){
            continue;
        }
        const file = hiddenFileInput.files[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tenant', tenant);
        formData.append('template', template);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Authorization', `JWT ${jwtAuthToken}`);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = parseFloat(((event.loaded / event.total) * 100).toFixed(2));
                console.log(`Upload progress for ${file.name}: ${percentComplete}%`);
                callback.invokeMethodAsync("OnUploadFileProgress", file.name, percentComplete);
                // You can update UI with the progress here
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                console.log(xhr.responseText);
                callback.invokeMethodAsync("OnUploadFileComplete", file.name, xhr.status, xhr.responseText);
            } else {
                console.error('Upload failed:', xhr.status, xhr.statusText);
                callback.invokeMethodAsync("OnUploadFileError", file.name, xhr.status, xhr.statusText);
            }
        };

        xhr.onerror = () => {
            console.error('Upload failed:', xhr.status, xhr.statusText);
            callback.invokeMethodAsync("OnFileUploadNetworkError", file.name, xhr.status, xhr.statusText);
            // You can handle upload failure here
        };

        xhr.send(formData);
    }

    return true;
}

window.clearSelectedFiles = function () {
    const hiddenFileInput = document.getElementById('fileInput');
    hiddenFileInput.value = '';
}
