# Deep learning

## Math

### Fundamental equation

```txt
ŷ = log(x1w1 + x2w2)
```
`ŷ` is the predictive value of Y. `log` is a place holder for any non-linear function.`x1 and x2` are inputs, for example hours studied when calculating chance that student will pass. `w1 and w2` are weightings behind inputs, for example hours studied would have heavy weighting.

### (ANN) Artificial Neural Networks

`ANNs` essentially comprise of bricks of this fundamental equation. Think of each of the circles in the middle as the bricks and the ends, the input and output.

**Image grabbed from https://miro.medium.com/v2/resize:fit:1400/1*Gh5PS4R_A5drl5ebd_gNrg@2x.png**

![Image couldn't load](https://miro.medium.com/v2/resize:fit:1400/1*Gh5PS4R_A5drl5ebd_gNrg@2x.png "ANN Visualization")

### Forward propagation & Backwards propagation

Take this example equation:

```txt
ŷ = x1w1 + x2w2
```
Where `x1` is how many litres of water drank the day before exam, and `x2` is hours studied before exam(x1 and x2 both have their attached weighting, and lastly `y hat` is the predictive measure if the student passed. In `Forward Propagation`, we are telling the model to take the exam. In `Backwards Propagation OR backprop`, we are telling the model to change the weightings depending on the negative feedback which in this case is if the student passed or failed. For example look at the above graphic, in `backprop`, the red circle would tell the green circles that the output is wrong, the green circles fix what they can and then tell the blue circles that something is wrong we got the wrong output and so on and so fourth *flowing backwords throughout the model.*

### Mathematical theories

The general idea of `Spectral theories` in math is you start with a **complicated** idea, and break it up into **simple** many components *OR* when you start with a **complex** idea, and break it up into a large or small amount of compenents. The main difference between complicated and complex ideas is that complicated ideas are inuitive and mostly linear. Think of things like CARs or DVDs. While complex ideas are unintuitive and mostly non-linear. Think things like biology and astrophysics.

### Dot product

The `Dot Product` is one of the most important foundational functions to learn in deep learning. It is fairly simple. It is commonly written as vTv. It is multiplying elements in the same position in seperate tensors and adding the sum. Importantly, the tensors need to have the exact same dimensions for it to work. This is what it looks like:

```txt
// Finding a vector dot product

Tensor1 = [1,2,3,4]
Tensor2 = [5,6,7,8]

Tensor1 dot Tensor2 = 1*5 + 2*6 + 3*7 + 4*8

// Finding a matrix dot product

Tensor3 = ([1,1,1],[2,2,2],[3,3,3])
Tensor4 = ([4,4,4],[5,5,5],[6,6,6])

Tensor3 dot Tensor4 = 1*4 + 1*4 + 1*4 + 2*5 + 2*5 + 2*5 + 3*6 + 3*6 + 3*6
```
The `dot product` is a single number that repreesents commonalities between objects(vectors,tensors,arrays). Typically, a dot product with the value of `1` means the tensors are `maximally` similar. `0` means `no similarity` and lastly, `-1` means `maximially dissimilar`.

### Matrix multiplication

Matrix multiplication is not as simple as it seems and has some requirements. The first requirement is they must have the same inner dimensions. For example, if we have `Matrix A`=5x2 and `Matrix B`=2x7. We **CAN** multiply these matricies as they have matching inner dimensions of 2. But, if we try and multiply B by A it will **NOT** work, as 7 != 5. It is also important to note that the size will be the **outside dimensions**. Lastly, the output will come out as ordered dot products with, in this example, 5x7 dimensions.

### Softmax

Softmaxxing an array is a way to get a percentage from each element of an array or matrix. That really not a good explaination, it is better to learn from a picture:

**Image grabbed from https://www.sharpsightlabs.com/wp-content/uploads/2022/03/numpy-softmax_simple-visual-example.png**

![Image couldn't load](https://www.sharpsightlabs.com/wp-content/uploads/2022/03/numpy-softmax_simple-visual-example.png "Softmax Visualization")

```txt
# Very simply the equation can be explained like this.

1. Take the exp of an array[1,2,3] -> [2.72,7.39,20.09]

2. Get the sum of all the exp of the array = 30.19

3. Then divide the original array by 30.19 = [0.09,0.24,0.67]

# Now you have your softmax!

# Note: The sum of the softmax will always equal 1 no matter the input.
```

### Logarithms

Logarithms are monotonic with exponentials and can never be defined for a value of `x` below zero. They are used in ML and DL to compute really small and close numbers for easier processing.

### Entropy

We are only concerned with `Shannon Entropy` which is a way to think about uncertainty. Probabilities are maximally uncertain at .5 and become more certain as the go towards 0 or 1 in a non linear way. This is what it looks like:

![Image couldn't load](https://tcosmo.github.io/assets/H/Figure_1.png "Shannon Entropy")

`Entropy` is a value of `1` when the probability is at `.5` and goes down as the probabilty becomes more certain.

### Finding min and max

Finding a `min` and `max` of a vector is simple. The min is the lowest element while the max is the highest. The `arg min` is the location in the vector of the `min` and vice versa for the `arg max`. This is important to know so that we can locate the element with the highest `softmax` or probability.

### Mean and variance

`Mean` is a good way to find a number to represent a normal gaussian distro. `Variance` is essentially the standard deviation of the distro. Calculating the `mean` and `variance` looks like this:

```txt
vector = [1,2,3,4,5]

sum = 15

mean  = 15/5 = 3

var = sum([-2,-1,0,1,2]sq)/2 = 2
```

### Random sampling and sampling variability

General idea that there will always be some sampling variability whenever you take a sample, regardless of how good the sampling technique is. The way to get around this is by taking high quality samples in great number.


### Reproducing randomness via seeding

When training an LLM you start with random weights. You can seed the weight similar to minecraft seeds so that it can be reproduced.

### T-Test

Test to benchmark `LLMs` against each other or against a percentage. The equation is difference of means over the standard deviation.

### Derivatives

`Derivatives` are essentially the slope of a line plotted. See image below for reference:

![Image can't load](https://miro.medium.com/v2/resize:fit:1200/1*G9B-tRaNfF1_VKJIEaPYwA.png "Derivative")

This is the derivative of the sigmoid function as you can see it rises and falls with the slope. The reason we use derivatives is to find local minima in `gradiant descent`. Two important rules to know in derivatives is the `product rule` and the `chain rule`. The product rule is: `(f + g)' = f' + g'`. The chain rule is: `(f. * g)' = f' * g + f * g'`


## Gradient Descent

`Gradient Descent` is the backbone of AI.

## (ANN) Artificial Neural Networks
