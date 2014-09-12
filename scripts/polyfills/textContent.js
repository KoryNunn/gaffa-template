if (Object.defineProperty && Object.getOwnPropertyDescriptor && Object.getOwnPropertyDescriptor(Element.prototype, "textContent") && !Object.getOwnPropertyDescriptor(Element.prototype, "textContent").get) {
    var elementInnerText = Object.getOwnPropertyDescriptor(Element.prototype, "innerText");
    Object.defineProperty(Element.prototype, "textContent",
        {
            get: function() {
                return elementInnerText.get.call(this);
            },
            set: function(string) {
                return elementInnerText.set.call(this, string);
            }
        }
    );

    var TextNode = document.createTextNode('').constructor;
    Object.defineProperty(TextNode.prototype, "textContent",
        {
            get: function() {
                return this.data;
            },
            set: function(string) {
                return this.data = string;
            }
        }
    );
}