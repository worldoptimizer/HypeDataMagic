# Hype Data Magic



![Hype-AnimationFrame|690x487](https://playground.maxziebell.de/Hype/DataMagic/HypeDataMagic_1.jpg)

<sup>The cover artwork is not hosted in this repository and &copy;opyrighted by Max Ziebell</sup>

### Usage

This is Hype DataMagic, it allows you to easily add and handle data in your Tumult Hype documents (with live preview).

#### Install Hype Data Magic

This step is very easy if you use the CDN version mentioned at the end of this document. Just copy and paste the following line into your Head HTML:

```html
<script src="https://cdn.jsdelivr.net/gh/worldoptimizer/HypeDataMagic/HypeDataMagic.min.js"></script>
```

Your done installing it.

*If you don't want to use the CDN Version, please download the repository and add the file -`HypeDataMagic.min.js` to your resource panel. Make sure it's added to Head HTML (Hype default).*

#### Basic example to set data:

Open Head HTML and add a script section to it `<script></script>`. Then add the following command in there

``` javascript
	HypeDataMagic.setData{
		name: 'Max Ziebell',
		hello: 'world',
	});
```

#### Bind data to your Hype document:

![Hype-Data-Magic-Documentation22](README.assets/Hype-Data-Magic-Documentation22.png)

1. Select an recangle on stage and goto the **Identy** panel 
2. Add a new key to the **Additional HTML Attributes** called `data-magic-key` and set the value to a key we used in `setData` like *name*

You should now see a preview of the data in you Hype document. From now on, when you edit the data in your Head HTML and change back to the scene you will see that updated reflected immediatly. This also works when previewing the Hype document and even works if you update the data in the browser console while previewing.

#### Basic example to set and bind data with nested objects:

```javascript
HypeDataMagic.setData{
	name: 'Max Ziebell',
	hello: 'world',
	items: [
		{
			location: 'Berlin',
			relation: 'This vibrant city is my current home'
		},
		{
			location: 'Formentera',
			relation: 'I grew up on this beautiful island'
		},
	],
});
```

**Binding nested data** is as simple as the previous example as the data-magic-key is parsed using a simple JavaScript array/object notation. 

![Hype-Data-Magic-Documentation21](README.assets/Hype-Data-Magic-Documentation21.png)

1. Select an recangle on stage and goto the **Identy** panel
2. This time we set the key to `items[0].location` as `items` is an array we chose the first branch (indexing starts at `0`) and the property `location`

You should now see a preview of the nested data in your rectangle. To see all the data just repeat the last steps and change the property to `relation` and for the other rectangles just change the index from `0` to `1`.



**Version-History:**  
`1.0	Initial release under MIT `   

Content Delivery Network (CDN)
--

Latest version can be linked into your project using the following in the head section of your project:

**Version with IDE-Preview:**

```html
<script src="https://cdn.jsdelivr.net/gh/worldoptimizer/HypeDataMagic/HypeDataMagic.min.js"></script>
```

**Version without IDE-Preview (saves some kilobytes in final delivery, if necessary):**

```html
<script src="https://cdn.jsdelivr.net/gh/worldoptimizer/HypeDataMagic/HypeDataMagic.prod.min.js"></script>
```

Optionally you can also link a SRI version or specific releases. 
Read more about that on the JsDelivr (CDN) page for this extension at https://www.jsdelivr.com/package/gh/worldoptimizer/HypeAnimationFrame

Learn how to use the latest extension version and how to combine extensions into one file at
https://github.com/worldoptimizer/HypeCookBook/wiki/Including-external-files-and-Hype-extensions