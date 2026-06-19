
document.addEventListener('DOMContentLoaded', function () {
    // Check which page we are on and attach to relevant inputs
    if (document.getElementById('tweetContent')) {
        setupAutocomplete('tweetContent', 'autocomplete-list');
    }
    if (document.getElementById('createTweetContent')) {
        setupAutocomplete('createTweetContent', 'autocomplete-list');
    }
});

function setupAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);

    if (!input || !list) return;

    let currentFocus = -1;

    input.addEventListener('input', function (e) {
        const val = this.value;
        const cursorPosition = this.selectionStart;
        const textBeforeCursor = val.substring(0, cursorPosition);

        // Find the last '@' symbol before the cursor
        const lastAt = textBeforeCursor.lastIndexOf('@');

        if (lastAt !== -1) {
            // Check if there's a whitespace before '@' or it's the start of line
            const charBeforeAt = lastAt > 0 ? textBeforeCursor[lastAt - 1] : '\n';
            if (/\s/.test(charBeforeAt)) {
                const query = textBeforeCursor.substring(lastAt + 1);
                // Only search if the query doesn't contain newlines (keep it to single line tagging)
                if (!query.includes('\n')) {
                    // Allow spaces in query for full names like "Himanta Biswa"
                    // Triggers search immediately
                    fetchSuggestions(query, list, input, cursorPosition, lastAt);
                    return;
                }
            }
        }

        closeAllLists();
    });

    input.addEventListener('keydown', function (e) {
        let x = list.getElementsByTagName('div');
        if (e.keyCode == 40) { // Arrow DOWN
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) { // Arrow UP
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) { // ENTER
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
                e.preventDefault();
            }
        }
    });

    function fetchSuggestions(query, listElement, inputElement, cursorPosition, startPosition) {
        // debounce could be added here
        fetch(`/mlas/search/json?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                renderSuggestions(data, listElement, inputElement, cursorPosition, startPosition, query);
            })
            .catch(err => console.error('Error fetching suggestions:', err));
    }

    function renderSuggestions(data, listElement, inputElement, cursorPosition, startPosition, query) {
        closeAllLists();
        if (!data || data.length === 0) return;

        currentFocus = -1;
        listElement.classList.remove('hidden'); // Show the list

        data.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = "p-2 hover:bg-slate-100 cursor-pointer border-b border-slate-100 last:border-0 flex items-center gap-2";

            // Create image element if available
            let imgHtml = '';
            if (item.image) {
                // Handle different image path formats
                const togglePath = item.image.startsWith('/') ? item.image : '/uploads/mlas/' + item.image;
                imgHtml = `<img src="${togglePath}" class="w-8 h-8 rounded-full object-cover">`;
            } else {
                imgHtml = `<div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">${item.name.charAt(0)}</div>`;
            }

            itemDiv.innerHTML = `
                ${imgHtml}
                <div>
                    <div class="font-semibold text-sm text-slate-800">${item.name}</div>
                    <div class="text-xs text-slate-500">${item.type} - ${item.subtext}</div>
                </div>
                <input type="hidden" value="${item.name}">
            `;

            itemDiv.addEventListener('click', function () {
                const text = inputElement.value;
                const beforeIdx = startPosition; // Index of @
                const afterIdx = cursorPosition;

                // Construct new text: part before @ + @Name + space + part after cursor
                const beforeText = text.substring(0, beforeIdx);
                const afterText = text.substring(afterIdx);

                const newText = beforeText + '@' + item.name + ' ' + afterText;

                inputElement.value = newText;

                // Set cursor after the inserted name
                const newCursorPos = beforeText.length + item.name.length + 2; // +2 for @ and space
                inputElement.setSelectionRange(newCursorPos, newCursorPos);

                closeAllLists();
                inputElement.focus();
            });

            listElement.appendChild(itemDiv);
        });
    }

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("bg-blue-50");
        x[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function removeActive(x) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove("bg-blue-50");
        }
    }

    function closeAllLists(elmnt) {
        // Clear inner HTML and hide
        list.innerHTML = '';
        list.classList.add('hidden');
    }

    // Close list when clicking outside
    document.addEventListener("click", function (e) {
        if (e.target !== input) {
            closeAllLists();
        }
    });
}
